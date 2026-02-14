import { useEffect, useMemo, useState } from 'react';
import Particles, { initParticlesEngine } from '@tsparticles/react';
import { loadSlim } from '@tsparticles/slim';

export const ParticlesBackground = (): JSX.Element | null => {
    const [init, setInit] = useState(false);

    useEffect(() => {
        void initParticlesEngine(async (engine) => {
            await loadSlim(engine);
        }).then(() => setInit(true));
    }, []);

    const options: Record<string, unknown> = useMemo(
        () => ({
            fullScreen: { enable: false },
            fpsLimit: 60,
            interactivity: {
                events: {
                    onHover: { enable: true, mode: 'grab' },
                },
                modes: {
                    grab: {
                        distance: 160,
                        links: { opacity: 0.35 },
                    },
                },
            },
            particles: {
                color: { value: ['#67b6df', '#2e86c1', '#182f50'] },
                links: {
                    color: '#67b6df',
                    distance: 150,
                    enable: true,
                    opacity: 0.2,
                    width: 1,
                },
                move: {
                    enable: true,
                    speed: 0.8,
                    direction: 'none' as const,
                    outModes: { default: 'bounce' as const },
                },
                number: {
                    density: { enable: true, width: 1200, height: 800 },
                    value: 50,
                },
                opacity: {
                    value: { min: 0.15, max: 0.5 },
                    animation: {
                        enable: true,
                        speed: 0.6,
                        sync: false,
                    },
                },
                shape: { type: 'circle' },
                size: {
                    value: { min: 1, max: 3 },
                },
            },
            detectRetina: true,
        }),
        [],
    );

    if (!init) return null;

    return (
        <Particles
            id="tsparticles"
            className="pointer-events-none fixed inset-0 z-0"
            options={options}
        />
    );
};
