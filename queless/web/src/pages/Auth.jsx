import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight } from 'lucide-react';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';
import { Reveal } from '../components/Motion';
import { Button, CheckList, Field, Input } from '../components/ui';
import { useAuth } from '../hooks/useAuth';

const loginSchema = z.object({
  email: z.email('Enter a valid email'),
  password: z.string().min(1, 'Enter your password'),
});
const registerSchema = z.object({
  fullName: z.string().trim().min(2, 'Your name please'),
  email: z.email('Enter a valid email'),
  password: z.string().min(8, 'At least 8 characters').regex(/[A-Za-z]/, 'Add a letter').regex(/\d/, 'Add a number'),
});

function useNext() {
  const [params] = useSearchParams();
  const next = params.get('next');
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/discover';
}

function AuthFrame({ title, kicker, children, side }) {
  return (
    <div className="mx-auto grid min-h-[72vh] max-w-6xl items-center gap-14 px-5 py-14 lg:grid-cols-2">
      <Reveal className="hidden lg:block">
        <p className="kicker">{kicker}</p>
        <h1 className="display mt-3 text-6xl">{title}</h1>
        <p className="lede mt-4 text-lg">{side}</p>
        <CheckList className="mt-8" items={['Live position and wait time', 'Alerts when your turn is near', 'Works for clinics, banks, salons and offices']} />
      </Reveal>
      <Reveal delay={80} className="card w-full p-7 shadow-[var(--shadow)] sm:p-9">
        <h1 className="mb-7 text-3xl lg:hidden">{title}</h1>
        {children}
      </Reveal>
    </div>
  );
}

export function Login() {
  const navigate = useNavigate();
  const next = useNext();
  const { user, login } = useAuth();
  const form = useForm({ resolver: zodResolver(loginSchema) });

  useEffect(() => {
    if (user) navigate(next, { replace: true });
  }, [user, next, navigate]);

  const onSubmit = form.handleSubmit(async (v) => {
    try {
      await login(v.email, v.password);
      toast.success('Welcome back!');
    } catch (e) {
      toast.error(e.message);
    }
  });

  return (
    <AuthFrame kicker="Welcome back" title="Welcome back" side="Your tokens, your queues, your business console — all in one place.">
      <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
        <Field label="Email" error={form.formState.errors.email?.message}>
          <Input type="email" autoComplete="email" {...form.register('email')} />
        </Field>
        <Field label="Password" error={form.formState.errors.password?.message}>
          <Input type="password" autoComplete="current-password" {...form.register('password')} />
        </Field>
        <Button variant="primary" size="lg" type="submit" loading={form.formState.isSubmitting}>Log in <ArrowRight size={18} /></Button>
      </form>
      <p className="mt-6 text-center">
        New here? <Link to={`/register?next=${encodeURIComponent(next)}`} className="font-semibold text-accent hover:underline">Create an account</Link>
      </p>
      <div className="mt-6 rounded-2xl bg-surface-2 p-4 text-sm text-muted">
        <b className="text-ink">Demo logins</b> (password <span className="mono">Queless@123</span>): customer@, manager@, staff@, admin@queless.dev
      </div>
    </AuthFrame>
  );
}

export function Register() {
  const navigate = useNavigate();
  const next = useNext();
  const { user, register: signUp } = useAuth();
  const form = useForm({ resolver: zodResolver(registerSchema) });

  useEffect(() => {
    if (user) navigate(next, { replace: true });
  }, [user, next, navigate]);

  const onSubmit = form.handleSubmit(async (v) => {
    try {
      await signUp(v.fullName, v.email, v.password);
      toast.success('Account created. Welcome to QueLess!');
    } catch (e) {
      toast.error(e.message);
    }
  });

  return (
    <AuthFrame kicker="New here" title="Create your account" side="One free account for every clinic, bank, salon and office on QueLess.">
      <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
        <Field label="Full name" error={form.formState.errors.fullName?.message}>
          <Input autoComplete="name" {...form.register('fullName')} />
        </Field>
        <Field label="Email" error={form.formState.errors.email?.message}>
          <Input type="email" autoComplete="email" {...form.register('email')} />
        </Field>
        <Field label="Password" error={form.formState.errors.password?.message} hint="8+ characters with a letter and a number">
          <Input type="password" autoComplete="new-password" {...form.register('password')} />
        </Field>
        <Button variant="primary" size="lg" type="submit" loading={form.formState.isSubmitting}>Create account <ArrowRight size={18} /></Button>
      </form>
      <p className="mt-6 text-center">
        Have an account? <Link to={`/login?next=${encodeURIComponent(next)}`} className="font-semibold text-accent hover:underline">Log in</Link>
      </p>
    </AuthFrame>
  );
}
