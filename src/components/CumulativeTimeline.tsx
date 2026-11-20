import React, { useMemo } from 'react';
import type { Accident, GpvWindow } from '../api/types';
import { CheckCircle2, Clock, ZapOff, AlertTriangle } from 'lucide-react';

interface CumulativeTimelineProps {
  accidents: Accident[];
  buildingNumber: string;
  streetName: string;
  group: string | null;
  gpvWindowsToday: GpvWindow[];
  gpvWindowsTomorrow: GpvWindow[];
  lastSync: string | null;
}

type Status = 'purple' | 'red' | 'yellow' | 'green' | 'gray';

interface TimeSegment {
  start: number; // minutes from start of local today
  end: number;
  statuses: Status[]; // most severe first, one slice per status
}

const STATUS_ORDER: Status[] = ['purple', 'red', 'yellow'];

// Helper to treat API's "UTC" dates as Local time values
const parseAPIDate = (dateStr: string) => {
  if (!dateStr) return new Date();
  return new Date(dateStr.replace(/Z|[+-]\d{2}:\d{2}$/, ''));
};

const getStatus = (acc: Accident, isDataOld: boolean): Status => {
  if (isDataOld) return 'gray';
  
  if (acc.switchSubReason === 1 || acc.switchSubReason === 3) return 'purple';
  if (acc.switchSubReason === 2) return 'red';
  
  if (acc.typeOff === 1) return 'purple';
  if (acc.typeOff === 0 || acc.typeOff === 2) return 'red';
  if (acc.typeOff === 30) return 'yellow';
  
  return 'gray';
};

const timeToMinutes = (value: string) => {
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 24 || minutes > 59) return null;
  return hours * 60 + minutes;
};

const CumulativeTimeline: React.FC<CumulativeTimelineProps> = ({ accidents, buildingNumber, streetName, group, gpvWindowsToday, gpvWindowsTomorrow, lastSync }) => {
  const todayStart = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }, []);
  const now = new Date(); // still need now for currentMinute calculation

  const isDataOld = useMemo(() => {
    if (!lastSync) return true;
    const syncDate = parseAPIDate(lastSync);
    const threshold = new Date(todayStart.getTime() - 48 * 60 * 60 * 1000);
    return syncDate < threshold;
  }, [lastSync, todayStart]);

  const segments = useMemo<TimeSegment[]>(() => {
    if (isDataOld) return [];

    const layers: Record<Status, Uint8Array> = {
      purple: new Uint8Array(2880),
      red: new Uint8Array(2880),
      yellow: new Uint8Array(2880),
      green: new Uint8Array(2880),
      gray: new Uint8Array(2880),
    };

    const addRange = (startMin: number, endMin: number, status: Status) => {
      if (status === 'green' || status === 'gray') return;
      for (let m = Math.max(0, startMin); m < Math.min(2880, endMin); m++) {
        layers[status][m] = 1;
      }
    };

    accidents.forEach(acc => {
      const start = parseAPIDate(acc.dateEvent);
      const end = parseAPIDate(acc.datePlanIn);

      const startMin = Math.max(0, Math.floor((start.getTime() - todayStart.getTime()) / (60 * 1000)));
      const endMin = Math.min(2880, Math.ceil((end.getTime() - todayStart.getTime()) / (60 * 1000)));

      if (startMin >= endMin) return;
      addRange(startMin, endMin, getStatus(acc, isDataOld));
    });

    const addGpvWindows = (windows: GpvWindow[], dayOffset: number) => {
      windows.forEach(window => {
        const start = timeToMinutes(window.from);
        const end = timeToMinutes(window.to);
        if (start === null || end === null || start >= end) return;
        addRange(dayOffset + start, dayOffset + end, 'red');
      });
    };

    addGpvWindows(gpvWindowsToday, 0);
    addGpvWindows(gpvWindowsTomorrow, 1440);

    const result: TimeSegment[] = [];
    let currentKey = '';
    let currentStatuses: Status[] = [];
    let currentStart = 0;

    for (let m = 0; m <= 2880; m++) {
      const key = m < 2880 ? STATUS_ORDER.filter(status => layers[status][m]).join(',') : '';

      if (key !== currentKey) {
        if (currentStatuses.length && m > currentStart) {
          result.push({ start: currentStart, end: m, statuses: currentStatuses });
        }
        currentKey = key;
        currentStatuses = key ? key.split(',') as Status[] : [];
        currentStart = m;
      }
    }

    return result;
  }, [accidents, gpvWindowsToday, gpvWindowsTomorrow, isDataOld, todayStart]);

  const currentMinute = Math.floor((now.getTime() - todayStart.getTime()) / (60 * 1000));
  
  const currentStatus: Status = useMemo(() => {
    if (isDataOld) return 'gray';
    const activeSegment = segments.find(s => currentMinute >= s.start && currentMinute < s.end);
    return activeSegment ? activeSegment.statuses[0] : 'green';
  }, [segments, currentMinute, isDataOld]);

  const addressLine = buildingNumber
    ? streetName
      ? `вул. ${streetName}, буд. ${buildingNumber}`
      : `буд. ${buildingNumber}`
    : 'Оберіть номер будинку';

  const getStatusColor = (status: Status) => {
    switch (status) {
      case 'purple': return 'bg-fuchsia-600';
      case 'red': return 'bg-rose-600';
      case 'yellow': return 'bg-amber-400';
      case 'green': return 'bg-emerald-500';
      case 'gray': return 'bg-slate-400';
      default: return 'bg-slate-200 dark:bg-slate-700';
    }
  };

  const getStatusLabel = (status: Status) => {
    switch (status) {
      case 'purple': return 'Аварійне';
      case 'red': return 'Планове';
      case 'yellow': return 'Можливе';
      case 'green': return 'Є світло';
      case 'gray': return 'Невідомо';
    }
  };

  const renderTimeline = (day: 0 | 1, startHour: number = 0, endHour: number = 24) => {
    const dayStartMin = day * 1440 + startHour * 60;
    const dayEndMin = day * 1440 + endHour * 60;
    const totalMin = (endHour - startHour) * 60;
    
    const daySegments = segments.filter(s => s.end > dayStartMin && s.start < dayEndMin);
    const baseColor = isDataOld ? 'bg-slate-200 dark:bg-slate-800' : 'bg-emerald-500';

    const markers = [];
    for (let h = startHour; h <= endHour; h += 3) {
      markers.push(h);
    }

    return (
      <div className={`relative h-20 ${baseColor} rounded-3xl overflow-hidden shadow-inner border border-slate-200 dark:border-slate-700 group`}>
        {daySegments.map((s, i) => {
          const left = Math.max(0, (s.start - dayStartMin) / totalMin * 100);
          const right = Math.min(100, (s.end - dayStartMin) / totalMin * 100);
          const width = right - left;
          const sliceHeight = 100 / s.statuses.length;

          return (
            <div
              key={i}
              className="absolute top-0 bottom-0"
              style={{ left: `${left}%`, width: `${width}%` }}
            >
              {s.statuses.map((status, index) => (
                <div
                  key={status}
                  className={`absolute left-0 right-0 transition-all duration-500 ${getStatusColor(status)}`}
                  style={{ top: `${index * sliceHeight}%`, height: `${sliceHeight}%` }}
                />
              ))}
            </div>
          );
        })}

        <div className="absolute inset-0 flex pointer-events-none">
          {Array.from({ length: endHour - startHour + 1 }).map((_, i) => {
            const h = startHour + i;
            return (
              <div 
                key={h} 
                className={`absolute h-full w-[1.5px] ${h % 3 === 0 ? 'bg-black/40 dark:bg-white/20' : 'bg-black/20 dark:bg-white/10'}`}
                style={{ left: `${((h - startHour) / (endHour - startHour)) * 100}%` }}
              />
            );
          })}
        </div>

        {day === Math.floor(currentMinute / 1440) && (currentMinute % 1440) >= startHour * 60 && (currentMinute % 1440) < endHour * 60 && (
          <div 
            className="absolute top-0 bottom-0 w-1.5 bg-white dark:bg-indigo-400 shadow-[0_0_15px_rgba(255,255,255,1)] dark:shadow-[0_0_15px_rgba(129,140,248,0.8)] z-10"
            style={{ left: `${((currentMinute % 1440) - startHour * 60) / totalMin * 100}%` }}
          >
            <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 bg-white dark:bg-indigo-400 rounded-full shadow-lg border-2 border-slate-100 dark:border-slate-800"></div>
          </div>
        )}

        <div className="absolute inset-0 flex pointer-events-none px-1">
          {markers.map(h => {
            const pos = ((h - startHour) / (endHour - startHour)) * 100;
            const hourLabel = h === 24 ? '00' : h.toString().padStart(2, '0');
            return (
              <div 
                key={h} 
                className={`absolute bottom-2 flex flex-col items-center ${pos < 5 ? 'left-2' : pos > 95 ? 'right-2' : ''}`}
                style={pos >= 5 && pos <= 95 ? { left: `${pos}%`, transform: 'translateX(-50%)' } : {}}
              >
                <span className={`text-[11px] font-black tracking-tight ${isDataOld ? 'text-slate-800 dark:text-slate-200' : 'text-white'} drop-shadow-md`}>
                  {hourLabel}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {isDataOld && (
        <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/50 p-4 rounded-2xl flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-500" />
          <p className="text-xs font-bold text-amber-800 dark:text-amber-400 uppercase tracking-widest leading-tight">Дані застаріли (останнє оновлення більше 48г. тому)</p>
        </div>
      )}
      <div className={`p-8 rounded-[2.5rem] border-4 transition-all duration-500 ${
        currentStatus === 'purple' ? 'bg-fuchsia-50 dark:bg-fuchsia-950/20 border-fuchsia-100 dark:border-fuchsia-900/50' :
        currentStatus === 'red' ? 'bg-rose-50 dark:bg-rose-950/20 border-rose-100 dark:border-rose-900/50' :
        currentStatus === 'yellow' ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-100 dark:border-amber-900/50' :
        currentStatus === 'gray' ? 'bg-slate-50 dark:bg-slate-900/50 border-slate-100 dark:border-slate-800' :
        'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-100 dark:border-emerald-900/50'
      }`}>
        <div className="flex flex-col md:flex-row items-center gap-8">
          <div className={`p-6 rounded-full shadow-2xl transition-transform hover:scale-105 duration-500 ${getStatusColor(currentStatus)}`}>
            {currentStatus === 'purple' || currentStatus === 'red' ? <ZapOff className="w-12 h-12 text-white" /> :
             currentStatus === 'yellow' ? <AlertTriangle className="w-12 h-12 text-white" /> :
             currentStatus === 'gray' ? <Clock className="w-12 h-12 text-white" /> :
             <CheckCircle2 className="w-12 h-12 text-white" />}
          </div>
          
          <div className="text-center md:text-left space-y-2">
            <h3 className={`text-4xl md:text-5xl font-black tracking-tighter uppercase ${
              currentStatus === 'purple' ? 'text-fuchsia-900 dark:text-fuchsia-300' :
              currentStatus === 'red' ? 'text-rose-900 dark:text-rose-300' :
              currentStatus === 'yellow' ? 'text-amber-900 dark:text-amber-300' :
              currentStatus === 'gray' ? 'text-slate-900 dark:text-slate-300' :
              'text-emerald-900 dark:text-emerald-300'
            }`}>
              {getStatusLabel(currentStatus)}
            </h3>
            <p className="font-bold text-sm uppercase tracking-widest text-slate-500 dark:text-slate-400">
              {addressLine}
            </p>
            {group && (
              <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-100 dark:border-rose-900/50">
                Черга ГПВ {group}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4 px-2">
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">
            <Clock className="w-3.5 h-3.5" /> Графік на 48 годин
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
             <div className="flex items-center gap-2">
               <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
               <span className="text-[11px] font-black uppercase text-slate-600 dark:text-slate-400">Є світло</span>
             </div>
             <div className="flex items-center gap-2">
               <div className="w-3 h-3 rounded-full bg-fuchsia-600"></div>
               <span className="text-[11px] font-black uppercase text-slate-600 dark:text-slate-400">Аварійне</span>
             </div>
             <div className="flex items-center gap-2">
               <div className="w-3 h-3 rounded-full bg-rose-600"></div>
               <span className="text-[11px] font-black uppercase text-slate-600 dark:text-slate-400">Планове</span>
             </div>
             <div className="flex items-center gap-2">
               <div className="w-3 h-3 rounded-full bg-amber-400"></div>
               <span className="text-[11px] font-black uppercase text-slate-600 dark:text-slate-400">Можливе</span>
             </div>
          </div>
        </div>

        <div className="space-y-12 bg-white dark:bg-slate-900 p-6 md:p-12 rounded-[2.5rem] md:rounded-[3rem] border border-slate-200/60 dark:border-slate-800/60 shadow-sm">
          <div className="space-y-4">
            <p className="text-[12px] font-black uppercase tracking-[0.25em] text-slate-400 dark:text-slate-500 ml-1">Сьогодні</p>
            <div className="hidden md:block">
              {renderTimeline(0, 0, 24)}
            </div>
            <div className="md:hidden space-y-4">
              {renderTimeline(0, 0, 12)}
              {renderTimeline(0, 12, 24)}
            </div>
          </div>
          
          <div className="space-y-4">
            <p className="text-[12px] font-black uppercase tracking-[0.25em] text-slate-400 dark:text-slate-500 ml-1">Завтра</p>
            <div className="hidden md:block">
              {renderTimeline(1, 0, 24)}
            </div>
            <div className="md:hidden space-y-4">
              {renderTimeline(1, 0, 12)}
              {renderTimeline(1, 12, 24)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CumulativeTimeline;
