import heroImg from '../assets/hero-illustration.png';

export const HeroIllustration = (): JSX.Element => {
    return (
        <div className="relative flex h-full min-h-[300px] w-full items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-sky-50 to-white">
            <img
                src={heroImg}
                alt="Planes alimenticios personalizados - 2000 KCAL"
                className="absolute inset-0 h-full w-full object-cover mix-blend-multiply opacity-90 transition-opacity hover:opacity-100"
            />
            {/* Overlay gradient to ensure text readability if needed, though usually handled by layout */}
            <div className="absolute inset-0 bg-gradient-to-t from-white/20 to-transparent pointer-events-none" />
        </div>
    );
};
