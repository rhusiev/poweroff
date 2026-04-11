import React, { useState, useEffect, useMemo, useRef } from 'react';
import { apiClient } from './api/client';
import type { OTG, City, Street, Accident, SavedAddress } from './api/types';
import SearchableSelect from './components/SearchableSelect';
import CumulativeTimeline from './components/CumulativeTimeline';
import { 
  Clock, MapPin, Search, Zap, 
  Hash, User, AlertCircle, CheckCircle2,
  RefreshCcw, LayoutGrid, ListChecks, ArrowRight,
  ExternalLink, Menu, X, Save, Trash2, Plus, Bookmark,
  Home
} from 'lucide-react';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'street' | 'account' | 'saved'>('street');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  
  const [otgs, setOtgs] = useState<OTG[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [streets, setStreets] = useState<Street[]>([]);
  const [accidents, setAccidents] = useState<Accident[]>([]);
  const [lastSync, setLastSync] = useState<string | null>(null);

  const [selectedOtg, setSelectedOtg] = useState<number | ''>('');
  const [selectedCity, setSelectedCity] = useState<number | ''>('');
  const [selectedStreet, setSelectedStreet] = useState<number | ''>('');
  const [buildingNumber, setBuildingNumber] = useState('');

  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>(() => {
    const saved = localStorage.getItem('saved_addresses');
    return saved ? JSON.parse(saved) : [];
  });
  const [customName, setCustomName] = useState('');

  const [accountNumber, setAccountNumber] = useState('');
  const [accountStatus, setAccountStatus] = useState<{
    light: boolean;
    res: boolean;
    date_plan_in?: string;
    comment?: string;
  } | null>(null);
  const [isCheckingAccount, setIsCheckingAccount] = useState(false);

  const [isLoading, setIsLoading] = useState({
    otgs: false,
    cities: false,
    streets: false,
    accidents: false,
  });

  const isAutoLoading = useRef(false);

  useEffect(() => {
    localStorage.setItem('saved_addresses', JSON.stringify(savedAddresses));
  }, [savedAddresses]);

  useEffect(() => {
    const init = async () => {
      setIsLoading(prev => ({ ...prev, otgs: true }));
      try {
        const [otgData, syncTime] = await Promise.all([
          apiClient.getOTGs(),
          apiClient.getLastSync(),
        ]);
        setOtgs(otgData.sort((a, b) => a.name.localeCompare(b.name)));
        setLastSync(syncTime);
      } catch (error) {
        console.error('Failed to fetch OTGs:', error);
      } finally {
        setIsLoading(prev => ({ ...prev, otgs: false }));
      }
    };
    init();
  }, []);

  useEffect(() => {
    if (selectedOtg) {
      const fetchCities = async () => {
        setIsLoading(prev => ({ ...prev, cities: true }));
        try {
          const data = await apiClient.getCities(selectedOtg);
          setCities(data.sort((a, b) => a.name.localeCompare(b.name)));
          if (!isAutoLoading.current) {
            setSelectedCity('');
            setSelectedStreet('');
            setBuildingNumber('');
            setStreets([]);
            setAccidents([]);
          }
        } catch (error) {
          console.error('Failed to fetch cities:', error);
        } finally {
          setIsLoading(prev => ({ ...prev, cities: false }));
        }
      };
      fetchCities();
    } else {
      if (!isAutoLoading.current) setCities([]);
    }
  }, [selectedOtg]);

  useEffect(() => {
    if (selectedCity) {
      const fetchStreets = async () => {
        setIsLoading(prev => ({ ...prev, streets: true }));
        try {
          const data = await apiClient.getStreets(selectedCity);
          setStreets(data.sort((a, b) => a.name.localeCompare(b.name)));
          if (!isAutoLoading.current) {
            setSelectedStreet('');
            setBuildingNumber('');
            setAccidents([]);
          }
        } catch (error) {
          console.error('Failed to fetch streets:', error);
        } finally {
          setIsLoading(prev => ({ ...prev, streets: false }));
        }
      };
      fetchStreets();
    } else {
      if (!isAutoLoading.current) setStreets([]);
    }
  }, [selectedCity]);

  useEffect(() => {
    if (selectedCity && selectedStreet) {
      const fetchAccidents = async () => {
        setIsLoading(prev => ({ ...prev, accidents: true }));
        try {
          const data = await apiClient.getAccidents(selectedCity, selectedStreet);
          setAccidents(data);
        } catch (error) {
          console.error('Failed to fetch accidents:', error);
        } finally {
          setIsLoading(prev => ({ ...prev, accidents: false }));
        }
      };
      fetchAccidents();
    } else {
      if (!isAutoLoading.current) setAccidents([]);
    }
  }, [selectedCity, selectedStreet]);

  const handleCheckAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (accountNumber.length !== 10) return;
    
    setIsCheckingAccount(true);
    try {
      const result = await apiClient.checkLight(accountNumber);
      setAccountStatus(result);
    } catch (error) {
      console.error('Failed to check account:', error);
    } finally {
      setIsCheckingAccount(false);
    }
  };

  const saveCurrentAddress = () => {
    if (!selectedOtg || !selectedCity || !selectedStreet || !buildingNumber) return;
    
    const otg = otgs.find(o => o.id === selectedOtg);
    const city = cities.find(c => c.id === selectedCity);
    const street = streets.find(s => s.id === selectedStreet);
    
    if (!otg || !city || !street) return;

    const newSaved: SavedAddress = {
      id: crypto.randomUUID(),
      customName: customName || `${street.name}, ${buildingNumber}`,
      otgId: otg.id,
      otgName: otg.name,
      cityId: city.id,
      cityName: city.name,
      streetId: street.id,
      streetName: street.name,
      buildingNumber,
    };

    setSavedAddresses(prev => [...prev, newSaved]);
    setCustomName('');
    setActiveTab('saved');
  };

  const removeSavedAddress = (id: string) => {
    setSavedAddresses(prev => prev.filter(a => a.id !== id));
  };

  const loadSavedAddress = async (addr: SavedAddress) => {
    isAutoLoading.current = true;
    setActiveTab('street');
    
    setSelectedOtg(addr.otgId);
    setSelectedCity(addr.cityId);
    setSelectedStreet(addr.streetId);
    setBuildingNumber(addr.buildingNumber);

    try {
      setIsLoading(prev => ({ ...prev, accidents: true }));
      const data = await apiClient.getAccidents(addr.cityId, addr.streetId);
      setAccidents(data);
      
      const [citiesData, streetsData] = await Promise.all([
        apiClient.getCities(addr.otgId),
        apiClient.getStreets(addr.cityId)
      ]);
      
      setCities(citiesData.sort((a, b) => a.name.localeCompare(b.name)));
      setStreets(streetsData.sort((a, b) => a.name.localeCompare(b.name)));
    } catch (error) {
      console.error('Failed to load saved address details:', error);
    } finally {
      setIsLoading(prev => ({ ...prev, accidents: false }));
      setTimeout(() => {
        isAutoLoading.current = false;
      }, 100);
    }
  };

  const isBuildingAffected = (target: string, buildingNames: string) => {
    if (!target || !buildingNames) return true;
    
    const normalize = (s: string) => s.trim().toLowerCase().replace(/[\s-]/g, '');
    const targetClean = target.trim().toLowerCase();
    const targetNormalized = normalize(target);
    const parts = buildingNames.split(',').map(p => p.trim().toLowerCase());
    
    for (const part of parts) {
      if (part === targetClean || normalize(part) === targetNormalized) return true;
      
      if (/^\d+-\d+$/.test(part)) {
        const [startStr, endStr] = part.split('-');
        const start = parseInt(startStr);
        const end = parseInt(endStr);
        const targetNum = parseInt(targetClean);
        
        if (!isNaN(start) && !isNaN(end) && !isNaN(targetNum)) {
          if (targetNum >= start && targetNum <= end) return true;
        }
      }
    }
    
    return false;
  };

  const filteredAccidents = useMemo(() => {
    if (!buildingNumber) return accidents;
    return accidents.filter(a => isBuildingAffected(buildingNumber, a.buildingNames));
  }, [accidents, buildingNumber]);

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '---';
    try {
      const localStr = dateStr.replace(/Z|[+-]\d{2}:\d{2}$/, '');
      const date = new Date(localStr);
      return new Intl.DateTimeFormat('uk-UA', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(date).replace(',', '');
    } catch (e) {
      console.warn('Date formatting failed', e);
      return dateStr;
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 font-sans selection:bg-indigo-100 selection:text-indigo-900">
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-200/60">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative group">
              <div className="absolute -inset-1 bg-gradient-to-tr from-indigo-500 to-amber-400 rounded-xl blur opacity-25 group-hover:opacity-40 transition duration-1000 group-hover:duration-200"></div>
              <div className="relative bg-white p-2 rounded-xl shadow-sm border border-slate-100">
                <Zap className="text-indigo-600 w-6 h-6" fill="currentColor" />
              </div>
            </div>
            <div className="hidden sm:block">
              <h1 className="text-lg font-black tracking-tighter text-slate-800 flex items-center gap-1.5 uppercase">
                PowerOff <span className="text-indigo-600">Lviv</span>
              </h1>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Live Status Tracker</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <nav className="hidden md:flex items-center gap-1">
              <button 
                onClick={() => setActiveTab('street')}
                className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'street' ? 'text-indigo-600 bg-indigo-50/50' : 'text-slate-500 hover:text-slate-800'}`}
              >
                Адреса
              </button>
              <button 
                onClick={() => setActiveTab('saved')}
                className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'saved' ? 'text-indigo-600 bg-indigo-50/50' : 'text-slate-500 hover:text-slate-800'}`}
              >
                Збережені
              </button>
              <button 
                onClick={() => setActiveTab('account')}
                className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'account' ? 'text-indigo-600 bg-indigo-50/50' : 'text-slate-500 hover:text-slate-800'}`}
              >
                Мій рахунок
              </button>
            </nav>
            
            <div className="h-6 w-px bg-slate-200 hidden sm:block"></div>
            
            {lastSync && (
              <div className="hidden lg:flex items-center gap-2 text-[10px] text-slate-400 font-black uppercase tracking-tighter bg-slate-100/50 px-3 py-1.5 rounded-full border border-slate-200/50">
                <RefreshCcw className="w-3 h-3" />
                <span>Оновлено: {formatDate(lastSync)}</span>
              </div>
            )}

            <button className="md:hidden p-2 text-slate-500" onClick={() => setIsMenuOpen(!isMenuOpen)}>
              {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {isMenuOpen && (
          <div className="md:hidden absolute top-full left-0 right-0 bg-white border-b border-slate-200 p-6 animate-in slide-in-from-top-2 duration-300">
            <div className="flex flex-col gap-4">
              <button 
                onClick={() => { setActiveTab('street'); setIsMenuOpen(false); }}
                className={`flex items-center gap-3 p-4 rounded-2xl font-bold transition-all ${activeTab === 'street' ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-50 text-slate-600'}`}
              >
                <MapPin className="w-5 h-5" /> Пошук за адресою
              </button>
              <button 
                onClick={() => { setActiveTab('saved'); setIsMenuOpen(false); }}
                className={`flex items-center gap-3 p-4 rounded-2xl font-bold transition-all ${activeTab === 'saved' ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-50 text-slate-600'}`}
              >
                <Bookmark className="w-5 h-5" /> Збережені адреси
              </button>
              <button 
                onClick={() => { setActiveTab('account'); setIsMenuOpen(false); }}
                className={`flex items-center gap-3 p-4 rounded-2xl font-bold transition-all ${activeTab === 'account' ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-50 text-slate-600'}`}
              >
                <Hash className="w-5 h-5" /> Перевірка рахунку
              </button>
            </div>
          </div>
        )}
      </header>

      <main className="max-w-6xl mx-auto px-6 py-12">
        <div className="flex flex-col lg:flex-row gap-12">
          <div className="lg:w-1/3 space-y-8">
            <div className="space-y-2">
              <h2 className="text-3xl font-black tracking-tight text-slate-800 leading-none">
                {activeTab === 'street' ? 'Знайдіть вашу адресу' : activeTab === 'saved' ? 'Збережені адреси' : 'Перевірте ваш рахунок'}
              </h2>
              <p className="text-slate-500 font-medium text-lg leading-snug">
                {activeTab === 'street' 
                  ? 'Отримуйте актуальну інформацію про планові та аварійні вимкнення електроенергії.' 
                  : activeTab === 'saved'
                  ? 'Швидкий доступ до ваших обраних адрес.'
                  : 'Швидкий доступ до інформації про наявність світла за номером особового рахунку.'}
              </p>
            </div>

            <div className="bg-white p-2 rounded-[2.5rem] border border-slate-200/60 shadow-xl shadow-slate-200/50">
              <div className="p-6 space-y-6">
                {activeTab === 'street' ? (
                  <>
                    <div className="space-y-4">
                      <SearchableSelect
                        label="Громада"
                        placeholder="Оберіть ОТГ..."
                        options={otgs}
                        value={selectedOtg}
                        onChange={(val) => setSelectedOtg(Number(val))}
                        disabled={isLoading.otgs}
                        icon={<MapPin className="w-4 h-4" />}
                      />

                      <SearchableSelect
                        label="Населений пункт"
                        placeholder="Оберіть місто..."
                        options={cities}
                        value={selectedCity}
                        onChange={(val) => setSelectedCity(Number(val))}
                        disabled={!selectedOtg || isLoading.cities}
                        isLoading={isLoading.cities}
                        icon={<LayoutGrid className="w-4 h-4" />}
                      />

                      <SearchableSelect
                        label="Вулиця"
                        placeholder="Оберіть вулицю..."
                        options={streets}
                        value={selectedStreet}
                        onChange={(val) => setSelectedStreet(Number(val))}
                        disabled={!selectedCity || isLoading.streets}
                        isLoading={isLoading.streets}
                        icon={<Search className="w-4 h-4" />}
                      />

                      <div className="space-y-1.5">
                        <label className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500/80 ml-1">Номер будинку</label>
                        <div className="relative">
                          <Home className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                          <input
                            type="text"
                            placeholder="Наприклад: 11 або 64Б"
                            className="w-full bg-slate-50/80 border border-slate-200 rounded-2xl pl-11 pr-4 py-4 focus:ring-2 focus:ring-indigo-500/20 transition-all font-bold text-slate-700"
                            value={buildingNumber}
                            onChange={(e) => setBuildingNumber(e.target.value)}
                          />
                        </div>
                      </div>

                      {selectedStreet && buildingNumber && (
                        <div className="pt-4 space-y-4 animate-in fade-in duration-500">
                          <div className="h-px bg-slate-100"></div>
                          <div className="space-y-1.5">
                            <label className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500/80 ml-1">Назва для збереження (опц.)</label>
                            <input
                              type="text"
                              placeholder="Дім, Робота тощо"
                              className="w-full bg-slate-50 border border-dashed border-slate-200 rounded-2xl px-4 py-3 focus:ring-2 focus:ring-indigo-500/20 transition-all font-bold text-slate-700"
                              value={customName}
                              onChange={(e) => setCustomName(e.target.value)}
                            />
                          </div>
                          <button
                            onClick={saveCurrentAddress}
                            className="w-full bg-indigo-50 text-indigo-600 rounded-2xl py-4 font-black uppercase tracking-widest text-sm hover:bg-indigo-100 transition-all flex items-center justify-center gap-2 group"
                          >
                            <Save className="w-4 h-4" /> Зберегти адресу
                          </button>
                        </div>
                      )}
                    </div>
                  </>
                ) : activeTab === 'saved' ? (
                  <div className="space-y-4">
                    {savedAddresses.length > 0 ? (
                      <div className="space-y-3">
                        {savedAddresses.map(addr => (
                          <div key={addr.id} className="group relative flex items-center justify-between p-4 bg-slate-50/80 rounded-2xl hover:bg-indigo-50/50 transition-all cursor-pointer border border-transparent hover:border-indigo-100" onClick={() => loadSavedAddress(addr)}>
                            <div className="flex items-center gap-4">
                              <div className="bg-white p-2.5 rounded-xl shadow-sm border border-slate-100 text-indigo-600 group-hover:scale-110 transition-transform">
                                <Bookmark className="w-4 h-4" fill="currentColor" />
                              </div>
                              <div className="overflow-hidden">
                                <h4 className="font-black text-slate-800 truncate">{addr.customName}</h4>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider truncate">
                                  {addr.cityName}, {addr.streetName} {addr.buildingNumber}
                                </p>
                              </div>
                            </div>
                            <button 
                              onClick={(e) => { e.stopPropagation(); removeSavedAddress(addr.id); }}
                              className="p-2 text-slate-300 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                        <button 
                          onClick={() => setActiveTab('street')}
                          className="w-full mt-4 flex items-center justify-center gap-2 py-4 border-2 border-dashed border-slate-200 rounded-2xl text-slate-400 font-black uppercase tracking-widest text-xs hover:border-indigo-200 hover:text-indigo-400 transition-all"
                        >
                          <Plus className="w-4 h-4" /> Додати нову
                        </button>
                      </div>
                    ) : (
                      <div className="py-8 text-center space-y-4">
                        <div className="bg-slate-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto text-slate-200">
                          <Bookmark className="w-8 h-8" />
                        </div>
                        <p className="text-sm font-bold text-slate-400 uppercase tracking-widest leading-relaxed px-4">У вас ще немає збережених адрес</p>
                        <button 
                          onClick={() => setActiveTab('street')}
                          className="text-indigo-600 font-black text-xs uppercase tracking-widest hover:underline"
                        >
                          Перейти до пошуку
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <form onSubmit={handleCheckAccount} className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-black uppercase tracking-[0.2em] text-indigo-600/80 ml-1">Номер рахунку</label>
                      <div className="relative">
                        <Hash className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                          type="text"
                          maxLength={10}
                          placeholder="0000000000"
                          className="w-full bg-slate-50/80 border border-slate-200 rounded-2xl pl-11 pr-4 py-4 focus:ring-2 focus:ring-indigo-500/20 transition-all font-mono font-black text-xl tracking-widest text-slate-700"
                          value={accountNumber}
                          onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ''))}
                        />
                      </div>
                    </div>
                    <button
                      type="submit"
                      disabled={accountNumber.length !== 10 || isCheckingAccount}
                      className="w-full bg-indigo-600 text-white rounded-2xl py-4 font-black uppercase tracking-widest text-sm hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 disabled:opacity-50 disabled:shadow-none flex items-center justify-center gap-2 group"
                    >
                      {isCheckingAccount ? <RefreshCcw className="w-4 h-4 animate-spin" /> : <>Перевірити <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" /></>}
                    </button>
                  </form>
                )}
              </div>
            </div>
          </div>

          <div className="lg:w-2/3 flex flex-col">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-3">
                <div className="bg-white p-2.5 rounded-xl border border-slate-200/60 shadow-sm">
                  <ListChecks className="w-5 h-5 text-indigo-600" />
                </div>
                <h3 className="text-xl font-black tracking-tight text-slate-800 uppercase">Статус мережі</h3>
              </div>
            </div>

            <div className="flex-1 min-h-[400px]">
              {activeTab === 'street' || activeTab === 'saved' ? (
                isLoading.accidents ? (
                  <div className="h-full flex flex-col items-center justify-center space-y-4">
                    <div className="relative">
                      <div className="w-16 h-16 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin"></div>
                      <Zap className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 text-indigo-600 animate-pulse" fill="currentColor" />
                    </div>
                    <p className="text-slate-400 font-black uppercase tracking-[0.2em] text-[10px]">Аналіз мережі...</p>
                  </div>
                ) : (selectedStreet && buildingNumber) || (activeTab === 'saved' && selectedStreet && buildingNumber) ? (
                  <CumulativeTimeline 
                    accidents={filteredAccidents} 
                    buildingNumber={buildingNumber} 
                    lastSync={lastSync} 
                  />
                ) : selectedStreet ? (
                   <div className="h-full bg-white rounded-[3rem] border border-slate-200/60 shadow-sm flex flex-col items-center justify-center p-12 text-center">
                    <div className="bg-slate-50 p-8 rounded-full mb-8">
                      <Home className="w-16 h-16 text-slate-200" />
                    </div>
                    <h3 className="text-xl font-black tracking-tight text-slate-400 uppercase mb-2">Оберіть будинок</h3>
                    <p className="text-slate-400 font-bold max-w-xs uppercase text-[10px] tracking-widest leading-relaxed">
                      Введіть номер будинку для детального графіку
                    </p>
                  </div>
                ) : (
                  <div className="h-full bg-white rounded-[3rem] border border-slate-200/60 shadow-sm flex flex-col items-center justify-center p-12 text-center">
                    <div className="bg-slate-50 p-8 rounded-full mb-8">
                      <Search className="w-16 h-16 text-slate-200" />
                    </div>
                    <h3 className="text-xl font-black tracking-tight text-slate-400 uppercase mb-2">Чекаємо на ввід</h3>
                    <p className="text-slate-400 font-bold max-w-xs uppercase text-[10px] tracking-widest leading-relaxed">
                      {activeTab === 'saved' ? 'Оберіть збережену адресу з панелі зліва' : 'Оберіть адресу з панелі зліва'}
                    </p>
                  </div>
                )
              ) : (
                <div className="space-y-8 max-w-2xl mx-auto">
                  {accountStatus ? (
                    <div className={`p-10 rounded-[3rem] border-4 shadow-2xl transition-all duration-700 animate-in slide-in-from-bottom-8 ${
                      accountStatus.light 
                      ? 'bg-emerald-50 border-emerald-100 shadow-emerald-100' 
                      : 'bg-rose-50 border-rose-100 shadow-rose-100'
                    }`}>
                      <div className="flex flex-col items-center text-center space-y-8">
                        <div className={`p-10 rounded-full shadow-2xl ${
                          accountStatus.light ? 'bg-emerald-500 shadow-emerald-200' : 'bg-rose-500 shadow-rose-200'
                        }`}>
                          {accountStatus.light 
                            ? <CheckCircle2 className="w-20 h-20 text-white" /> 
                            : <AlertCircle className="w-20 h-20 text-white" />
                          }
                        </div>
                        
                        <div className="space-y-4">
                          <h3 className={`text-5xl font-black tracking-tighter uppercase ${accountStatus.light ? 'text-emerald-900' : 'text-rose-900'}`}>
                            {accountStatus.light ? 'Світло є' : 'Світло відсутнє'}
                          </h3>
                          {accountStatus.comment && (
                            <p className={`text-xl font-bold italic ${accountStatus.light ? 'text-emerald-700' : 'text-rose-700'}`}>
                              "{accountStatus.comment}"
                            </p>
                          )}
                        </div>

                        {!accountStatus.light && accountStatus.date_plan_in && (
                          <div className="bg-white/80 backdrop-blur p-8 rounded-[2rem] border border-rose-200 w-full max-w-md shadow-lg">
                            <div className="flex items-center justify-center gap-3 text-[11px] font-black text-rose-800 uppercase tracking-[0.2em] mb-3">
                              <Clock className="w-4 h-4" />
                              Очікуване ввімкнення
                            </div>
                            <p className="text-4xl font-black text-rose-900 tracking-tight">
                              {formatDate(accountStatus.date_plan_in)}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="h-full bg-indigo-50/50 rounded-[3rem] border-2 border-dashed border-indigo-100 flex flex-col items-center justify-center p-12 text-center">
                      <div className="bg-white p-8 rounded-full shadow-xl shadow-indigo-100 mb-8">
                        <User className="w-16 h-16 text-indigo-600" />
                      </div>
                      <h3 className="text-xl font-black tracking-tight text-indigo-900 uppercase mb-2">Готові до перевірки</h3>
                      <p className="text-indigo-700 font-bold max-w-xs uppercase text-[10px] tracking-widest leading-relaxed">
                        Введіть 10 цифр вашого особового рахунку в панелі зліва
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      <footer className="max-w-6xl mx-auto px-6 py-12 border-t border-slate-200/60">
        <div className="flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="space-y-4 text-center md:text-left">
            <div className="flex items-center justify-center md:justify-start gap-3">
              <Zap className="text-indigo-600 w-5 h-5" fill="currentColor" />
              <span className="text-lg font-black tracking-tighter text-slate-800 uppercase">PowerOff Lviv</span>
            </div>
            <p className="text-slate-400 font-bold text-xs max-w-sm leading-relaxed">
              Незалежний сервіс моніторингу електромереж міста Львова. Дані надані Lvivoblenergo API.
            </p>
          </div>
          
          <div className="flex items-center gap-8">
             <a href="https://loe.lviv.ua" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-[10px] font-black text-indigo-600 bg-indigo-50 px-4 py-2 rounded-xl border border-indigo-100 hover:bg-indigo-100 transition-all uppercase tracking-widest">
                Lvivoblenergo <ExternalLink className="w-3 h-3" />
              </a>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-300">© 2026 PowerOff Lviv</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;
