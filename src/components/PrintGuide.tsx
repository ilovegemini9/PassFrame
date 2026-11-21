import React from 'react';
import { ArrowRight, CheckCircle2, Printer, ShieldAlert, Sun } from 'lucide-react';

interface PrintGuideProps {
  onReturnToStudio: () => void;
}

export const PrintGuide: React.FC<PrintGuideProps> = ({ onReturnToStudio }) => {
  return (
    <section aria-label="Home capture and printing guide" className="mx-auto max-w-[960px]">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          How to Capture & Print Compliant Passport Photos at Home
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
          Follow three simple studio rules to avoid pharmacy markups and automated government portal rejections.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <article className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
            <Sun className="h-5 w-5" aria-hidden="true" />
          </div>
          <h2 className="mt-4 text-base font-semibold text-slate-900">
            01. Natural Window Light
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Face a bright window during daylight hours with a plain white or light-gray wall 1 meter behind you. Standing slightly away from the wall prevents harsh head shadows from appearing behind your ears.
          </p>
        </article>

        <article className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
            <ShieldAlert className="h-5 w-5" aria-hidden="true" />
          </div>
          <h2 className="mt-4 text-base font-semibold text-slate-900">
            02. Avoid AI Retouching
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            The US State Department, UK HMPO, and Schengen systems reject photos modified with AI background swaps, skin smoothing, or portrait-mode blur. PassFrame only applies standard framing and exposure balance.
          </p>
        </article>

        <article className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
            <Printer className="h-5 w-5" aria-hidden="true" />
          </div>
          <h2 className="mt-4 text-base font-semibold text-slate-900">
            03. Print 4×6" for Pennies
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Export the 4×6" (10×15 cm) Print Sheet and order a standard 4×6 glossy or matte photo print at CVS, Walgreens, Walmart, Boots, or any local photo lab (~$0.35), then trim along the corner crop marks.
          </p>
        </article>
      </div>

      <div className="mt-8 rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-base font-semibold text-slate-900">
          Pre-Submission Biometric Checklist
        </h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {[
            'Neutral facial expression with mouth closed and both eyes open',
            'Remove eyeglasses, hats, and headphones before taking the photo',
            'Camera positioned straight at eye level, roughly 1.5 meters away',
            'Keep hair behind ears and avoid white shirts on a white wall',
            'Ensure Background Light check reads ≥ 185/255 with low shadow variance',
            'Print at 100% scale ("Actual Size")—never select "Fit to Page" if borders clip',
          ].map((rule) => (
            <li key={rule} className="flex items-start gap-2.5 text-sm text-slate-700">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
              <span>{rule}</span>
            </li>
          ))}
        </ul>

        <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-5">
          <p className="text-xs text-slate-500">
            All processing runs locally inside your browser tab with zero server uploads.
          </p>
          <button
            type="button"
            onClick={onReturnToStudio}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 cursor-pointer whitespace-nowrap"
          >
            <span>Back to Photo Studio</span>
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </section>
  );
};
