import logo from '../assets/FitPilot-Logo.svg';

type BootSplashProps = {
  exiting?: boolean;
  message?: string;
  variant?: 'boot' | 'generate';
};

export const BootSplash = ({
  exiting = false,
  message = 'Cargando plataforma...',
  variant = 'boot',
}: BootSplashProps): JSX.Element => (
  <section
    aria-label="Pantalla de carga"
    aria-live="polite"
    className={`boot-splash ${exiting ? 'boot-splash--exit' : ''} ${
      variant === 'generate' ? 'boot-splash--generate' : ''
    }`}
    role="status"
  >
    <div className="boot-splash__glow" />
    <div className="boot-splash__halo" />
    <div className="boot-splash__card">
      <img alt="FitPilot" className="boot-splash__logo" src={logo} />
      <div aria-hidden className="boot-splash__pulse" />
      <p className="boot-splash__text">{message}</p>
      {variant === 'generate' ? (
        <p className="boot-splash__subtext">Calculando equivalentes y recomendaciones...</p>
      ) : null}
    </div>
  </section>
);
