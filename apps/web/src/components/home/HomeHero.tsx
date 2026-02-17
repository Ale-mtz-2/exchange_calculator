import { HeroIllustration } from '../HeroIllustration';
import { FEATURES } from './constants';

const FeatureIcon = ({ d, color = '#67b6df' }: { d: string; color?: string }): JSX.Element => (
    <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
        style={{ background: `${color}18` }}
    >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke={color} strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d={d} />
        </svg>
    </div>
);

export const HomeHero = (): JSX.Element => {
    return (
        <section className="animate-fade-in rounded-[2rem] border border-sky/15 bg-gradient-to-br from-white/90 via-white/80 to-sky-50/60 p-6 shadow-[0_16px_48px_rgba(24,47,80,0.08)] backdrop-blur-xl md:p-8 lg:p-10">
            <div className="grid items-center gap-8 lg:grid-cols-2">
                <div className="space-y-8">
                    <div className="animate-slide-up">
                        <span className="inline-block rounded-full bg-sky/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-sky">
                            Nutricion inteligente
                        </span>
                        <h2 className="mt-3 text-3xl font-extrabold leading-tight text-ink md:text-4xl">
                            Genera planes alimenticios{' '}
                            <span className="bg-gradient-to-r from-[#0f8bff] to-[#2e86c1] bg-clip-text text-transparent">
                                personalizados
                            </span>
                        </h2>
                        <p className="mt-4 max-w-xl text-base leading-relaxed text-slate-600">
                            Calculadora dinamica basada en sistemas de equivalentes. Ingresa el perfil del
                            paciente y obten un plan completo con distribucion de macros, grupos de alimentos y
                            recomendaciones personalizadas.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {FEATURES.map((feature) => (
                            <div
                                key={feature.title}
                                className="group flex gap-3 rounded-2xl border border-sky/10 bg-white/60 p-3.5 shadow-sm transition-all duration-300 hover:border-sky/30 hover:bg-white hover:shadow-md"
                            >
                                <FeatureIcon d={feature.icon} color={feature.color} />
                                <div className="min-w-0">
                                    <p className="text-sm font-bold text-ink">{feature.title}</p>
                                    <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{feature.desc}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="hidden h-[460px] lg:block">
                    <HeroIllustration />
                </div>
            </div>
        </section>
    );
};
