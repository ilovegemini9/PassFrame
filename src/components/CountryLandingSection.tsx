import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import {
  COUNTRY_SPECS,
  formatPhysicalDimensions,
  getCountryFaqs,
  getSpecUrlPath,
  type CountryPhotoSpec,
  type Region,
} from '../data/countrySpecs';

interface CountryLandingSectionProps {
  spec: CountryPhotoSpec;
  onNavigateCountry: (spec: CountryPhotoSpec) => void;
}

const REGIONS: Region[] = [
  'Americas',
  'Europe',
  'Asia-Pacific',
  'Middle East & Africa',
];

export const CountryLandingSection: React.FC<CountryLandingSectionProps> = ({
  spec,
  onNavigateCountry,
}) => {
  const [openFaqIndex, setOpenFaqIndex] = useState<number>(0);
  const faqs = getCountryFaqs(spec);
  const dim = formatPhysicalDimensions(spec);

  return (
    <div className="mt-10 space-y-10 border-t border-slate-200 pt-10">
      {/* 1. Country-Specific Official Requirements & Instructions */}
      <section aria-labelledby="country-requirements-heading" className="grid gap-8 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <h2 id="country-requirements-heading" className="text-lg font-bold tracking-tight text-slate-900 sm:text-xl">
            {spec.country} — {spec.document} Specifications
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            {spec.officialNotes} {spec.retouchWarning}
          </p>

          <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-slate-200 pt-5 sm:grid-cols-3">
            <div>
              <dt className="text-xs font-medium text-slate-500">Print / Frame Size</dt>
              <dd className="mt-1 font-mono-tabular text-sm font-semibold text-slate-900">{dim}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500">Digital Pixels</dt>
              <dd className="mt-1 font-mono-tabular text-sm font-semibold text-slate-900">
                {spec.widthPx} × {spec.heightPx} px
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500">Head Height</dt>
              <dd className="mt-1 font-mono-tabular text-sm font-semibold text-slate-900">
                {spec.headMinPct}%–{spec.headMaxPct}%
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500">Eye Line (from bottom)</dt>
              <dd className="mt-1 font-mono-tabular text-sm font-semibold text-slate-900">
                {spec.eyeFromBottomMinPct}%–{spec.eyeFromBottomMaxPct}%
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500">Background</dt>
              <dd className="mt-1 text-sm font-semibold text-slate-900">{spec.backgroundLabel}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500">Max File Size</dt>
              <dd className="mt-1 font-mono-tabular text-sm font-semibold text-slate-900">
                {spec.maxFileKb ? `≤ ${spec.maxFileKb} KB` : 'Standard JPG/PNG'}
              </dd>
            </div>
          </dl>
        </div>

        {/* 2. Country-Specific FAQ (matches Schema.org FAQPage) */}
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h3 className="text-base font-semibold text-slate-900">
            Frequently Asked Questions — {spec.country}
          </h3>
          <div className="mt-3 divide-y divide-slate-100">
            {faqs.map((faq, idx) => {
              const isOpen = openFaqIndex === idx;
              return (
                <div key={faq.question} className="py-3 first:pt-1 last:pb-1">
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => setOpenFaqIndex(isOpen ? -1 : idx)}
                    className="flex w-full items-start justify-between gap-3 text-left text-sm font-medium text-slate-900 hover:text-blue-700 cursor-pointer"
                  >
                    <span>{faq.question}</span>
                    <ChevronDown
                      className={`mt-0.5 h-4 w-4 shrink-0 text-slate-400 transition-transform ${
                        isOpen ? 'rotate-180' : ''
                      }`}
                      aria-hidden="true"
                    />
                  </button>
                  {isOpen && (
                    <p className="mt-2 text-xs leading-relaxed text-slate-600">{faq.answer}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 3. Programmatic SEO Internal Linking Hub across all 36 Country Pages */}
      <section aria-labelledby="all-country-pages-heading" className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
          <h2 id="all-country-pages-heading" className="text-base font-semibold text-slate-900">
            All {COUNTRY_SPECS.length} Country & Visa Photo Studios
          </h2>
          <p className="text-xs text-slate-500">
            Dedicated biometric templates with exact millimeter, pixel, and file-size verification
          </p>
        </div>

        <div className="mt-5 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {REGIONS.map((region) => {
            const regionSpecs = COUNTRY_SPECS.filter((s) => s.region === region);
            return (
              <div key={region}>
                <h3 className="text-xs font-semibold text-slate-500 pb-2 border-b border-slate-100">
                  {region}
                </h3>
                <ul className="mt-2.5 space-y-1.5">
                  {regionSpecs.map((item) => {
                    const href = getSpecUrlPath(item);
                    const isActive = item.id === spec.id;
                    return (
                      <li key={item.id}>
                        <a
                          href={href}
                          onClick={(e) => {
                            e.preventDefault();
                            onNavigateCountry(item);
                          }}
                          className={`block text-xs transition-colors truncate ${
                            isActive
                              ? 'font-semibold text-blue-700'
                              : 'text-slate-600 hover:text-slate-900 hover:underline'
                          }`}
                        >
                          {item.country} — {item.document}
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};
