import React, { useMemo } from 'react';
import type { Accident } from '../api/types';
import { CheckCircle2, Clock, ZapOff, AlertTriangle } from 'lucide-react';

interface CumulativeTimelineProps {
  accidents: Accident[];
  buildingNumber: string;
  lastSync: string | null;
}

type Status = 'purple' | 'red' | 'yellow' | 'green' | 'gray';

interface TimeSegment {
  start: number; // minutes from start of local today
  end: number;
  status: Status;
}

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

const CumulativeTimeline: React.FC<CumulativeTimelineProps> = ({ accidents, buildingNumber, lastSync }) => {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const isDataOld = useMemo(() => {
    if (!lastSync) return true;
    const syncDate = parseAPIDate(lastSync);
    const threshold = new Date(todayStart.getTime() - 48 * 60 * 60 * 1000);
    return syncDate < threshold;
  }, [lastSync, todayStart]);

  const segments = useMemo(() => {
    const rawRanges: { start: number; end: number; status: Status }[] = [];

    accidents.forEach(acc => {
      const start = parseAPIDate(acc.dateEvent);
      const end = parseAPIDate(acc.datePlanIn);
      const status = getStatus(acc, isDataOld);

      const startMin = Math.max(0, Math.floor((start.getTime() - todayStart.getTime()) / (60 * 1000)));
      const endMin = Math.min(2880, Math.ceil((end.getTime() - todayStart.getTime()) / (60 * 1000)));

      if (startMin >= endMin) return;
      rawRanges.push({ start: startMin, end: endMin, status });
    });

    rawRanges.sort((a, b) => a.start - b.start || a.end - b.end);

    const merged: TimeSegment[] = [];
    if (rawRanges.length === 0) return [];

    const statusPriority: Record<Status, number> = {
      purple: 3,
      red: 2,
      yellow: 1,
      green: 0,
      gray: -1
    };

    const minutes = new Array(2880).fill(isDataOld ? 'gray' : 'green');
    
    rawRanges.forEach(range => {
      for (let m = range.start; m < range.end; m++) {
        if (m >= 0 && m < 2880) {
          const currentPrio = statusPriority[minutes[m] as Status];
          const newPrio = statusPriority[range.status];
          if (newPrio > currentPrio) {
            minutes[m] = range.status;
          }
        }
      }
    });

    let start = 0;
    while (start < 2880) {
      const status = minutes[start];
      let end = start + 1;
      while (end < 2880 && minutes[end] === status) {
        end++;
      }
      if (status !== 'green' || isDataOld) {
        merged.push({ start, end, status: status as Status });
      }
      start = end;
    }

    return merged;
  }, [accidents, isDataOld, todayStart]);

  const currentMinute = Math.floor((now.getTime() - todayStart.getTime()) / (60 * 1000));
  
  const currentStatus: Status = useMemo(() => {
    if (isDataOld) return 'gray';
    const activeSegment = segments.find(s => currentMinute >= s.start && currentMinute < s.end);
    return activeSegment ? activeSegment.status : 'green';
  }, [segments, currentMinute, isDataOld]);

  const getStatusColor = (status: Status) => {
    switch (status) {
      case 'purple': return 'bg-fuchsia-600';
      case 'red': return 'bg-rose-600';
      case 'yellow': return 'bg-amber-400';
      case 'green': return 'bg-emerald-500';
      case 'gray': return 'bg-slate-400';
      default: return 'bg-slate-200';
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
    const baseColor = isDataOld ? 'bg-slate-200' : 'bg-emerald-500';

    const markers = [];
    for (let h = startHour; h <= endHour; h += 3) {
      markers.push(h);
    }

    return (
      <div className={`relative h-20 ${baseColor} rounded-3xl overflow-hidden shadow-inner border border-slate-200 group`}>
        {daySegments.map((s, i) => {
          const left = Math.max(0, (s.start - dayStartMin) / totalMin * 100);
          const right = Math.min(100, (s.end - dayStartMin) / totalMin * 100);
          const width = right - left;
          
          return (
            <div 
              key={i}
              className={`absolute h-full transition-all duration-500 ${getStatusColor(s.status)}`}
              style={{ left: `${left}%`, width: `${width}%` }}
            />
          );
        })}

        <div className="absolute inset-0 flex pointer-events-none">
          {Array.from({ length: endHour - startHour + 1 }).map((_, i) => {
            const h = startHour + i;
            return (
              <div 
                key={h} 
                className={`absolute h-full w-[1.5px] ${h % 3 === 0 ? 'bg-black/40' : 'bg-black/20'}`}
                style={{ left: `${((h - startHour) / (endHour - startHour)) * 100}%` }}
              />
            );
          })}
        </div>

        {day === Math.floor(currentMinute / 1440) && (currentMinute % 1440) >= startHour * 60 && (currentMinute % 1440) < endHour * 60 && (
          <div 
            className="absolute top-0 bottom-0 w-1.5 bg-white shadow-[0_0_15px_rgba(255,255,255,1)] z-10"
            style={{ left: `${((currentMinute % 1440) - startHour * 60) / totalMin * 100}%` }}
          >
            <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full shadow-lg border-2 border-slate-100"></div>
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
                <span className={`text-[11px] font-black tracking-tight ${isDataOld ? 'text-slate-800' : 'text-white'} drop-shadow-md`}>
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
        <div className="bg-amber-50 border border-amber-100 p-4 rounded-2xl flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-500" />
          <p className="text-xs font-bold text-amber-800 uppercase tracking-widest leading-tight">Дані застаріли (останнє оновлення більше 48г. тому)</p>
        </div>
      )}
      <div className={`p-8 rounded-[2.5rem] border-4 transition-all duration-500 ${
        currentStatus === 'purple' ? 'bg-fuchsia-50 border-fuchsia-100' :
        currentStatus === 'red' ? 'bg-rose-50 border-rose-100' :
        currentStatus === 'yellow' ? 'bg-amber-50 border-amber-100' :
        currentStatus === 'gray' ? 'bg-slate-50 border-slate-100' :
        'bg-emerald-50 border-emerald-100'
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
              currentStatus === 'purple' ? 'text-fuchsia-900' :
              currentStatus === 'red' ? 'text-rose-900' :
              currentStatus === 'yellow' ? 'text-amber-900' :
              currentStatus === 'gray' ? 'text-slate-900' :
              'text-emerald-900'
            }`}>
              {getStatusLabel(currentStatus)}
            </h3>
            <p className="font-bold text-sm uppercase tracking-widest text-slate-500">
              {buildingNumber ? `вул. ${accidents[0]?.street.name}, буд. ${buildingNumber}` : 'Оберіть номер будинку'}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4 px-2">
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
            <Clock className="w-3.5 h-3.5" /> Графік на 48 годин
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
             <div className="flex items-center gap-2">
               <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
               <span className="text-[11px] font-black uppercase text-slate-600">Є світло</span>
             </div>
             <div className="flex items-center gap-2">
               <div className="w-3 h-3 rounded-full bg-fuchsia-600"></div>
               <span className="text-[11px] font-black uppercase text-slate-600">Аварійне</span>
             </div>
             <div className="flex items-center gap-2">
               <div className="w-3 h-3 rounded-full bg-rose-600"></div>
               <span className="text-[11px] font-black uppercase text-slate-600">Планове</span>
             </div>
             <div className="flex items-center gap-2">
               <div className="w-3 h-3 rounded-full bg-amber-400"></div>
               <span className="text-[11px] font-black uppercase text-slate-600">Можливе</span>
             </div>
          </div>
        </div>

        <div className="space-y-12 bg-white p-6 md:p-12 rounded-[2.5rem] md:rounded-[3rem] border border-slate-200/60 shadow-sm">
          <div className="space-y-4">
            <p className="text-[12px] font-black uppercase tracking-[0.25em] text-slate-400 ml-1">Сьогодні</p>
            <div className="hidden md:block">
              {renderTimeline(0, 0, 24)}
            </div>
            <div className="md:hidden space-y-4">
              {renderTimeline(0, 0, 12)}
              {renderTimeline(0, 12, 24)}
            </div>
          </div>
          
          <div className="space-y-4">
            <p className="text-[12px] font-black uppercase tracking-[0.25em] text-slate-400 ml-1">Завтра</p>
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
