import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Check, X } from 'lucide-react';
import { lazy, Suspense, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Container } from '../../components/Layout';
import { Avatar, Button, Field, Input, PageHeader, Select, Skeleton, Textarea, Toggle, clsx } from '../../components/ui';
import { useAuth } from '../../hooks/useAuth';
import { api, errorMessage, uploadFile } from '../../lib/api';
import { DAYS } from '../../lib/format';

const MapView = lazy(() => import('../../components/MapView').then((m) => ({ default: m.MapView })));

const defaultHours = () => Object.fromEntries(DAYS.map((d) => [d, d === 'sun' ? null : ['09:00', '18:00']]));
const STEPS = ['Details', 'Location', 'Hours', 'Documents', 'Review'];

/** 5-step onboarding wizard. With `existing` it becomes the edit form. */
export function BusinessForm({ existing, onSaved }) {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(null);
  const [f, setF] = useState(() => ({
    name: existing?.name ?? '',
    categoryId: existing?.category_id ?? 1,
    description: existing?.description ?? '',
    phone: existing?.phone ?? '',
    address: existing?.address ?? '',
    pincode: existing?.pincode ?? '',
    lat: existing?.lat ?? null,
    lng: existing?.lng ?? null,
    wheelchair: existing?.amenities?.wheelchair ?? false,
    parking: existing?.amenities?.parking ?? false,
    hours: existing?.opening_hours ?? defaultHours(),
    logoFileId: existing?.logo_file_id ?? null,
    kycFileId: existing?.kyc_file_id ?? null,
  }));
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const { data: cats } = useQuery({ queryKey: ['categories'], queryFn: () => api('/categories') });
  const categories = cats?.categories ?? [];

  const stepValid = [
    f.name.trim().length >= 3,
    f.address.trim().length >= 5 && /^\d{6}$/.test(f.pincode) && f.lat != null,
    true,
    existing ? true : !!f.kycFileId,
    true,
  ];

  const centerOnPincode = async () => {
    try {
      const { pincode: p } = await api(`/pincodes/${f.pincode}`);
      setF((prev) => ({ ...prev, lat: p.lat, lng: p.lng }));
    } catch {
      toast.error('Pincode not found — click the map to drop your pin');
    }
  };

  const upload = async (kind, file) => {
    if (!file) return;
    setUploading(kind);
    try {
      const id = await uploadFile(kind, file);
      set(kind === 'logo' ? 'logoFileId' : 'kycFileId', id);
      toast.success('Uploaded');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setUploading(null);
    }
  };

  const submit = async () => {
    setSaving(true);
    const body = {
      name: f.name.trim(), categoryId: Number(f.categoryId), description: f.description.trim(), phone: f.phone.trim() || undefined,
      address: f.address.trim(), pincode: f.pincode, lat: f.lat, lng: f.lng,
      amenities: { wheelchair: f.wheelchair, parking: f.parking }, openingHours: f.hours,
      logoFileId: f.logoFileId, kycFileId: f.kycFileId,
    };
    try {
      if (existing) {
        await api(`/businesses/${existing.id}`, { method: 'PATCH', body });
        toast.success('Saved');
        onSaved?.();
      } else {
        const r = await api('/businesses', { method: 'POST', body });
        await refresh();
        toast.success('Submitted for approval!');
        navigate(`/biz/${r.business.id}`);
      }
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <ol className="mb-8 flex flex-wrap gap-2">
        {STEPS.map((s, i) => (
          <li key={s}>
            <button type="button" onClick={() => (i <= step || stepValid.slice(0, i).every(Boolean) ? setStep(i) : undefined)} className={clsx('chip', i === step && 'chip-on', i < step && '!border-ok !text-ok')}>
              {i < step ? <Check size={13} /> : i + 1} {s}
            </button>
          </li>
        ))}
      </ol>

      <div className={existing ? '' : 'card p-6 sm:p-8'}>
        {step === 0 && (
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Business name" className="sm:col-span-2"><Input value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="Sahyadri ENT Clinic" maxLength={80} /></Field>
            <Field label="Category">
              <Select value={f.categoryId} onChange={(e) => set('categoryId', Number(e.target.value))}>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
              </Select>
            </Field>
            <Field label="Phone"><Input value={f.phone} onChange={(e) => set('phone', e.target.value)} placeholder="020-2543xxxx" /></Field>
            <Field label="Short description" className="sm:col-span-2" hint="Shown on your card, max 500 characters"><Textarea value={f.description} maxLength={500} onChange={(e) => set('description', e.target.value)} /></Field>
          </div>
        )}

        {step === 1 && (
          <div className="grid gap-5">
            <Field label="Address"><Input value={f.address} onChange={(e) => set('address', e.target.value)} placeholder="Paud Road, near Kothrud Depot" /></Field>
            <div className="flex items-end gap-3">
              <Field label="Pincode" className="flex-1"><Input inputMode="numeric" maxLength={6} className="mono" value={f.pincode} onChange={(e) => set('pincode', e.target.value.replace(/\D/g, ''))} /></Field>
              <Button type="button" onClick={() => void centerOnPincode()} disabled={f.pincode.length !== 6}>Center map</Button>
            </div>
            <p className="text-sm text-muted">Click on the map to drop the exact pin for your door.</p>
            <Suspense fallback={<Skeleton className="h-80" />}>
              <MapView pins={[]} center={f.lat != null ? [f.lat, f.lng] : undefined} picked={f.lat != null ? [f.lat, f.lng] : null} onPick={(lat, lng) => setF((p) => ({ ...p, lat, lng }))} height={340} />
            </Suspense>
            {f.lat != null && <p className="mono text-xs">📍 {f.lat.toFixed(5)}, {f.lng.toFixed(5)}</p>}
          </div>
        )}

        {step === 2 && (
          <div>
            <div className="mb-6 flex flex-wrap gap-6">
              <Toggle label="♿ Wheelchair accessible" checked={f.wheelchair} onChange={(v) => set('wheelchair', v)} />
              <Toggle label="🅿 Parking" checked={f.parking} onChange={(v) => set('parking', v)} />
            </div>
            <p className="label">Opening hours (IST)</p>
            <div className="flex flex-col gap-2">
              {DAYS.map((d) => {
                const h = f.hours[d];
                return (
                  <div key={d} className="flex flex-wrap items-center gap-3 rounded-2xl border border-line p-2.5">
                    <span className="w-12 font-bold capitalize">{d}</span>
                    <Toggle label={h ? 'Open' : 'Closed'} checked={!!h} onChange={(v) => set('hours', { ...f.hours, [d]: v ? ['09:00', '18:00'] : null })} />
                    {h && (
                      <>
                        <input type="time" className="input !w-32 !py-1.5" value={h[0]} onChange={(e) => set('hours', { ...f.hours, [d]: [e.target.value, h[1]] })} />
                        <span>to</span>
                        <input type="time" className="input !w-32 !py-1.5" value={h[1]} onChange={(e) => set('hours', { ...f.hours, [d]: [h[0], e.target.value] })} />
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="grid gap-8 sm:grid-cols-2">
            <div>
              <p className="label">Logo (optional)</p>
              <div className="flex items-center gap-4">
                <Avatar name={f.name || 'Q'} fileId={f.logoFileId} size={76} />
                <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => void upload('logo', e.target.files?.[0])} className="text-sm" />
              </div>
              {uploading === 'logo' && <p className="mt-2 text-xs blink">Uploading…</p>}
            </div>
            <div>
              <p className="label">KYC document {existing ? '(optional)' : '(required)'}</p>
              <p className="mb-3 text-xs text-muted">Shop licence, clinic registration or GST certificate. PDF/JPG/PNG up to 2 MB. Private — only admins and your managers can open it.</p>
              <input type="file" accept="application/pdf,image/png,image/jpeg" onChange={(e) => void upload('kyc', e.target.files?.[0])} className="text-sm" />
              {uploading === 'kyc' && <p className="mt-2 text-xs blink">Uploading…</p>}
              {f.kycFileId && <p className="mt-2 text-sm font-bold text-ok">✓ Document uploaded</p>}
            </div>
          </div>
        )}

        {step === 4 && (
          <ul className="grid gap-3">
            {[
              [true, `${f.name} · ${categories.find((c) => c.id === Number(f.categoryId))?.name ?? ''}`],
              [true, `${f.address}, ${f.pincode}`],
              [true, `${Object.values(f.hours).filter(Boolean).length} open days ${f.wheelchair ? '· ♿ ' : ''}${f.parking ? '· 🅿' : ''}`],
              [!!f.kycFileId || !!existing, f.kycFileId ? 'KYC document uploaded' : 'KYC document missing'],
            ].map(([ok, text]) => (
              <li key={text} className="flex items-center gap-3 rounded-2xl border border-line p-3.5">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg text-white" style={{ background: ok ? 'var(--ok)' : 'var(--bad)' }}>{ok ? <Check size={15} /> : <X size={15} />}</span>
                {text}
              </li>
            ))}
            {!existing && <li className="mt-3 text-muted">After you submit, the status is <b>Pending approval</b>. You can already create queues and counters.</li>}
          </ul>
        )}

        <hr className="divider my-8" />
        <div className="flex justify-between">
          <Button type="button" onClick={() => setStep((s) => s - 1)} disabled={step === 0}><ArrowLeft size={16} /> Back</Button>
          {step < STEPS.length - 1 ? (
            <Button type="button" variant="primary" onClick={() => setStep((s) => s + 1)} disabled={!stepValid[step]}>Next <ArrowRight size={16} /></Button>
          ) : (
            <Button type="button" variant="primary" onClick={() => void submit()} loading={saving} disabled={!stepValid.every(Boolean)}>{existing ? 'Save changes' : 'Submit for approval'}</Button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Onboard() {
  return (
    <Container className="max-w-4xl">
      <PageHeader kicker="New business" title="Register your business" sub="Five quick steps. An admin reviews it, then you're live." />
      <BusinessForm />
    </Container>
  );
}
