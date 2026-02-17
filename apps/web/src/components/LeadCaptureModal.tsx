import { useState } from 'react';
import { saveLead } from '../lib/api';

type Props = {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
};

export const LeadCaptureModal = ({ isOpen, onClose, onSuccess }: Props): JSX.Element | null => {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [whatsapp, setWhatsapp] = useState('');
    const [termsAccepted, setTermsAccepted] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!name.trim()) {
            setError('Por favor ingresa tu nombre.');
            return;
        }

        if (!email.trim() && !whatsapp.trim()) {
            setError('Por favor ingresa al menos un medio de contacto (Email o WhatsApp).');
            return;
        }

        if (!termsAccepted) {
            setError('Debes aceptar los terminos y condiciones para continuar.');
            return;
        }

        setIsLoading(true);

        try {
            await saveLead({
                name,
                email: email || undefined,
                whatsapp: whatsapp || undefined,
                termsAccepted,
            });
            onSuccess();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Error al guardar. Intenta de nuevo.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-fade-in">
            <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl animate-scale-up">
                <div className="bg-sky-50 px-6 py-4 border-b border-sky-100">
                    <h3 className="text-lg font-bold text-sky-900">
                        Completar perfil
                    </h3>
                    <p className="text-sm text-sky-700 mt-1">
                        Dejanos tus datos para enviarte tu plan y novedades.
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    {error && (
                        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600 border border-red-100">
                            {error}
                        </div>
                    )}

                    <div>
                        <label htmlFor="name" className="block text-sm font-medium text-slate-700 mb-1">
                            Nombre completo <span className="text-red-500">*</span>
                        </label>
                        <input
                            id="name"
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full rounded-lg border-slate-200 bg-slate-50 text-sm focus:border-sky-500 focus:ring-sky-500"
                            placeholder="Tu nombre"
                            disabled={isLoading}
                        />
                    </div>

                    <div>
                        <label htmlFor="whatsapp" className="block text-sm font-medium text-slate-700 mb-1">
                            WhatsApp
                        </label>
                        <input
                            id="whatsapp"
                            type="tel"
                            value={whatsapp}
                            onChange={(e) => setWhatsapp(e.target.value)}
                            className="w-full rounded-lg border-slate-200 bg-slate-50 text-sm focus:border-sky-500 focus:ring-sky-500"
                            placeholder="+52 123 456 7890"
                            disabled={isLoading}
                        />
                    </div>

                    <div>
                        <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1">
                            Correo electronico
                        </label>
                        <input
                            id="email"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full rounded-lg border-slate-200 bg-slate-50 text-sm focus:border-sky-500 focus:ring-sky-500"
                            placeholder="correo@ejemplo.com"
                            disabled={isLoading}
                        />
                        <p className="mt-1 text-xs text-slate-400">
                            Debes llenar al menos uno de los dos campos de contacto.
                        </p>
                    </div>

                    <div className="flex items-start gap-2 pt-2">
                        <div className="flex h-5 items-center">
                            <input
                                id="terms"
                                type="checkbox"
                                checked={termsAccepted}
                                onChange={(e) => setTermsAccepted(e.target.checked)}
                                disabled={isLoading}
                                className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                            />
                        </div>
                        <label htmlFor="terms" className="text-xs text-slate-600">
                            Acepto los{' '}
                            <a href="#" className="font-medium text-sky-600 hover:underline">
                                terminos y condiciones
                            </a>{' '}
                            y la{' '}
                            <a href="#" className="font-medium text-sky-600 hover:underline">
                                politica de privacidad
                            </a>
                            .
                        </label>
                    </div>

                    <div className="mt-6 flex justify-end gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={isLoading}
                            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={isLoading || !termsAccepted}
                            className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-sky-700 disabled:opacity-50 flex items-center gap-2"
                        >
                            {isLoading ? (
                                <>
                                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white"></span>
                                    Guardando...
                                </>
                            ) : (
                                'Guardar datos'
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

