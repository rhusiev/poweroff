import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';

interface Option {
  id: number | string;
  name: string;
}

interface SearchableSelectProps {
  options: Option[];
  value: number | string | '';
  onChange: (value: number | string) => void;
  placeholder: string;
  disabled?: boolean;
  label: string;
  icon: React.ReactNode;
  isLoading?: boolean;
}

const SearchableSelect: React.FC<SearchableSelectProps> = ({
  options,
  value,
  onChange,
  placeholder,
  disabled,
  label,
  icon,
  isLoading
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find(o => o.id === value);
  const displayValue = selectedOption ? selectedOption.name : '';

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchTerm('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredOptions = options.filter(option =>
    option.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-1.5" ref={dropdownRef}>
      <label className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500/80 ml-1">{label}</label>
      <div className="relative">
        <div className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10">
          {icon}
        </div>
        <div
          className={`w-full bg-slate-50/80 border border-slate-200 rounded-2xl pl-11 pr-10 py-4 transition-all cursor-pointer font-bold text-slate-700 flex items-center justify-between min-h-[56px] ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-slate-300 hover:bg-slate-100/50'}`}
          onClick={() => !disabled && setIsOpen(!isOpen)}
        >
          <span className={`truncate mr-2 ${displayValue ? 'text-slate-800' : 'text-slate-400'}`}>
            {isLoading ? 'Завантаження...' : (displayValue || placeholder)}
          </span>
          <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
        </div>

        {isOpen && !disabled && (
          <div className="absolute z-50 w-full mt-2 bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="p-3 border-b border-slate-100 flex items-center gap-2">
              <Search className="w-4 h-4 text-slate-400" />
              <input
                autoFocus
                type="text"
                placeholder="Пошук..."
                className="w-full bg-transparent border-0 focus:ring-0 text-sm font-bold text-slate-700 p-0"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              {searchTerm && (
                <button onClick={() => setSearchTerm('')}>
                  <X className="w-4 h-4 text-slate-400" />
                </button>
              )}
            </div>
            <div className="max-h-60 overflow-y-auto">
              {filteredOptions.length > 0 ? (
                filteredOptions.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={`w-full text-left px-5 py-3 text-sm font-bold transition-colors hover:bg-slate-50 ${option.id === value ? 'text-indigo-600 bg-indigo-50/30' : 'text-slate-600'}`}
                    onClick={() => {
                      onChange(option.id);
                      setIsOpen(false);
                      setSearchTerm('');
                    }}
                  >
                    {option.name}
                  </button>
                ))
              ) : (
                <div className="px-5 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest text-center">
                  Нічого не знайдено
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SearchableSelect;
