import React, { useMemo, useState } from 'react';
import { ArrowRight, Search } from 'lucide-react';
import {
  COUNTRY_SPECS,
  filterSpecsByRegion,
  formatPhysicalDimensions,
  getSpecUrlPath,
  searchCountrySpecs,
  type CountryPhotoSpec,
  type Region,
} from '../data/countrySpecs';

interface CountryDirectoryProps {
  activeSpecId: string;
  onSelectInStudio: (specId: string) => void;
}

const REGIONS: (Region | 'All')[] = [
  'All',
  'Americas',
  'Europe',
  'Asia-Pacific',
  'Middle East & Africa',
];

export const CountryDirectory: React.FC<CountryDirectoryProps> = ({
  activeSpecId,
  onSelectInStudio,
}) => {
  const [query, setQuery] = useState('');
  const [region, setRegion] = useState<Region | 'All'>('All');

  const filteredSpecs = useMemo(() => {
    const byRegion = filterSpecsByRegion(COUNTRY_SPECS, region);
    return searchCountrySpecs(byRegion, query);
  }, [region, query]);

  return (
    <section aria-label="Global passport and visa photo specifications" className="mx-auto max-w-[1200px]">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          Official Passport & Visa Photo Requirements
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          Verified millimeter, pixel, head-height ratio, and maximum file size rules across {COUNTRY_SPECS.length} global documents. Select any specification to open it in the biometric alignment studio.
        </p>
      </div>

      {/* Filter Toolbar */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <label htmlFor="directory-search" className="sr-only">
            Search country or visa type
          </label>
          <input
            id="directory-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search country, DV Lottery, Schengen..."
            className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/20"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1" role="group" aria-label="Filter by region">
          {REGIONS.map((item) => {
            const isSelected = region === item;
            return (
              <button
                key={item}
                type="button"
                onClick={() => setRegion(item)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  isSelected
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {item}
              </button>
            );
          })}
        </div>
      </div>

      {/* Specs Data Table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {filteredSpecs.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm font-medium text-slate-900">No specifications matched "{query}"</p>
            <p className="mt-1 text-xs text-slate-500">
              Try searching by country name (e.g. France, Canada, Morocco) or clearing the region filter.
            </p>
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setRegion('All');
              }}
              className="mt-4 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 cursor-pointer"
            >
              Clear Filters
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="px-4 py-3">Country & Document</th>
                  <th className="px-4 py-3 whitespace-nowrap">Physical Size</th>
                  <th className="px-4 py-3 whitespace-nowrap">Digital Output</th>
                  <th className="px-4 py-3 whitespace-nowrap">Head Height</th>
                  <th className="px-4 py-3">Background & Limit</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredSpecs.map((spec: CountryPhotoSpec) => {
                  const isCurrent = spec.id === activeSpecId;
                  return (
                    <tr
                      key={spec.id}
                      className="transition-colors hover:bg-slate-50/80"
                    >
                      <td className="px-4 py-3.5 align-top">
                        <div className="font-semibold text-slate-900">{spec.country}</div>
                        <div className="text-xs text-slate-600">{spec.document}</div>
                        <div className="mt-0.5 text-[11px] text-slate-400">
                          {spec.region} · Glasses: {spec.glassesAllowed}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 align-top font-mono-tabular text-xs font-medium text-slate-800 whitespace-nowrap">
                        {formatPhysicalDimensions(spec)}
                      </td>
                      <td className="px-4 py-3.5 align-top font-mono-tabular text-xs text-slate-700 whitespace-nowrap">
                        {spec.widthPx}×{spec.heightPx} px
                        <div className="text-[11px] text-slate-400">{spec.dpi} DPI</div>
                      </td>
                      <td className="px-4 py-3.5 align-top font-mono-tabular text-xs text-slate-700 whitespace-nowrap">
                        {spec.headMinPct}%–{spec.headMaxPct}%
                      </td>
                      <td className="px-4 py-3.5 align-top text-xs text-slate-600">
                        <div>{spec.backgroundLabel}</div>
                        <div className="mt-0.5 font-mono-tabular text-[11px] text-slate-400">
                          {spec.maxFileKb ? `Max ${spec.maxFileKb} KB` : 'Standard print/digital'}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 align-top text-right whitespace-nowrap">
                        <a
                          href={getSpecUrlPath(spec)}
                          onClick={(e) => {
                            e.preventDefault();
                            onSelectInStudio(spec.id);
                          }}
                          aria-label={`Use ${spec.country} ${spec.document} in studio`}
                          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                            isCurrent
                              ? 'bg-blue-50 text-blue-800 border border-blue-200'
                              : 'bg-slate-900 text-white hover:bg-slate-800'
                          }`}
                        >
                          <span>{isCurrent ? 'Active in Studio' : 'Use in Studio'}</span>
                          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
};
