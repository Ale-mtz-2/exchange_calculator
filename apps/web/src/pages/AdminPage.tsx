import { useEffect, useMemo, useState } from 'react';

import {
  getAdminCampaignContacts,
  getAdminCampaigns,
  getAdminContactDetail,
  getAdminContacts,
  getAdminSummary,
} from '../lib/api';

type Credentials = {
  user: string;
  pass: string;
};

type CampaignSelection = {
  utmCampaign: string;
  mcMsgId: string | null;
  campaignKey: string;
};

const SESSION_KEY = 'equivalentes_admin_creds';

const readSessionCredentials = (): Credentials | null => {
  const raw = sessionStorage.getItem(SESSION_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as Credentials;
  } catch {
    return null;
  }
};

const writeSessionCredentials = (credentials: Credentials): void => {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(credentials));
};

const pct = (value: number): string => `${Math.round(value * 100)}%`;

export const AdminPage = (): JSX.Element => {
  const [sourceFilter, setSourceFilter] = useState<'all' | 'whatsapp' | 'guest'>('all');
  const [credentials, setCredentials] = useState<Credentials | null>(() => readSessionCredentials());
  const [formUser, setFormUser] = useState(credentials?.user ?? '');
  const [formPass, setFormPass] = useState(credentials?.pass ?? '');
  const [summary, setSummary] = useState<any>(null);
  const [contacts, setContacts] = useState<any>(null);
  const [page, setPage] = useState(1);
  const [selectedCid, setSelectedCid] = useState<string | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<any>(null);

  const [campaignDays, setCampaignDays] = useState(30);
  const [campaigns, setCampaigns] = useState<any>(null);
  const [campaignPage, setCampaignPage] = useState(1);
  const [selectedCampaign, setSelectedCampaign] = useState<CampaignSelection | null>(null);
  const [campaignContacts, setCampaignContacts] = useState<any>(null);
  const [campaignContactsPage, setCampaignContactsPage] = useState(1);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const totalPages = useMemo(() => {
    const total = contacts?.total ?? 0;
    const pageSize = contacts?.pageSize ?? 20;
    return Math.max(1, Math.ceil(total / pageSize));
  }, [contacts]);

  const campaignTotalPages = useMemo(() => {
    const total = campaigns?.total ?? 0;
    const pageSize = campaigns?.pageSize ?? 20;
    return Math.max(1, Math.ceil(total / pageSize));
  }, [campaigns]);

  const campaignContactsTotalPages = useMemo(() => {
    const total = campaignContacts?.total ?? 0;
    const pageSize = campaignContacts?.pageSize ?? 20;
    return Math.max(1, Math.ceil(total / pageSize));
  }, [campaignContacts]);

  useEffect(() => {
    if (!credentials) return;

    setLoading(true);
    setError(null);

    void Promise.all([
      getAdminSummary(credentials.user, credentials.pass),
      getAdminContacts(credentials.user, credentials.pass, page, 20, sourceFilter),
      getAdminCampaigns(credentials.user, credentials.pass, campaignPage, 20, campaignDays),
    ])
      .then(([summaryData, contactsData, campaignsData]) => {
        setSummary(summaryData);
        setContacts(contactsData);
        setCampaigns(campaignsData);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'No fue posible cargar dashboard');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [campaignDays, campaignPage, credentials, page, sourceFilter]);

  useEffect(() => {
    setPage(1);
    setSelectedCid(null);
  }, [sourceFilter]);

  useEffect(() => {
    setCampaignPage(1);
    setSelectedCampaign(null);
    setCampaignContacts(null);
  }, [campaignDays]);

  useEffect(() => {
    if (!credentials || !selectedCid) {
      setSelectedDetail(null);
      return;
    }

    void getAdminContactDetail(credentials.user, credentials.pass, selectedCid)
      .then((data) => {
        setSelectedDetail(data);
      })
      .catch(() => {
        setSelectedDetail(null);
      });
  }, [credentials, selectedCid]);

  useEffect(() => {
    if (!credentials || !selectedCampaign) {
      setCampaignContacts(null);
      return;
    }

    void getAdminCampaignContacts(
      credentials.user,
      credentials.pass,
      selectedCampaign.utmCampaign,
      selectedCampaign.mcMsgId,
      campaignContactsPage,
      20,
    )
      .then((data) => {
        setCampaignContacts(data);
      })
      .catch(() => {
        setCampaignContacts(null);
      });
  }, [campaignContactsPage, credentials, selectedCampaign]);

  const onLogin = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const creds = { user: formUser.trim(), pass: formPass };
    writeSessionCredentials(creds);
    setCredentials(creds);
  };

  const logout = (): void => {
    sessionStorage.removeItem(SESSION_KEY);
    setCredentials(null);
    setSummary(null);
    setContacts(null);
    setCampaigns(null);
    setSelectedCid(null);
    setSelectedDetail(null);
    setSelectedCampaign(null);
    setCampaignContacts(null);
    setSourceFilter('all');
    setError(null);
  };

  if (!credentials) {
    return (
      <section className="mx-auto mt-12 w-full max-w-md rounded-[1.8rem] border border-sky-100 bg-white/85 p-6 shadow-[0_20px_46px_rgba(38,99,170,0.14)] backdrop-blur-xl">
        <h2 className="text-2xl font-extrabold text-ink">Acceso admin</h2>
        <p className="mt-2 text-sm text-slate-600">Ingresa tus credenciales Basic Auth para ver el dashboard.</p>

        <form className="mt-5 grid gap-3" onSubmit={onLogin}>
          <label className="grid gap-1.5 text-sm font-semibold text-sky-950">
            Usuario
            <input
              className="w-full rounded-xl border border-sky-200 bg-white/95 px-3 py-2.5 text-sm outline-none transition focus:border-coral focus:ring-4 focus:ring-sky-100"
              value={formUser}
              onChange={(event) => setFormUser(event.target.value)}
              required
            />
          </label>

          <label className="grid gap-1.5 text-sm font-semibold text-sky-950">
            Contraseña
            <input
              className="w-full rounded-xl border border-sky-200 bg-white/95 px-3 py-2.5 text-sm outline-none transition focus:border-coral focus:ring-4 focus:ring-sky-100"
              type="password"
              value={formPass}
              onChange={(event) => setFormPass(event.target.value)}
              required
            />
          </label>

          <button
            className="rounded-2xl bg-gradient-to-r from-coral to-moss px-4 py-2.5 text-sm font-bold text-white shadow-[0_10px_24px_rgba(15,139,255,0.28)]"
            type="submit"
          >
            Entrar
          </button>
        </form>
      </section>
    );
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
      <section className="rounded-[1.8rem] border border-sky-100 bg-white/85 p-5 shadow-[0_20px_46px_rgba(38,99,170,0.14)] backdrop-blur-xl md:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-moss">Dashboard</p>
            <h2 className="text-2xl font-extrabold text-ink">Tracking por CID</h2>
          </div>

          <button className="rounded-xl border border-sky-200 bg-white px-3 py-2 text-sm font-bold text-ink" onClick={logout} type="button">
            Salir
          </button>
        </div>

        {error ? <p className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p> : null}
        {loading ? <p className="text-sm text-slate-600">Cargando...</p> : null}

        {summary ? (
          <div className="mb-5 grid gap-3 sm:grid-cols-4">
            <article className="rounded-2xl border border-sky-100 bg-cloud p-3">
              <p className="text-xs uppercase tracking-[0.14em] text-slate-500">CID únicos</p>
              <p className="text-2xl font-extrabold text-ink">{summary.uniqueCids}</p>
            </article>
            <article className="rounded-2xl border border-sky-100 bg-cloud p-3">
              <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Open</p>
              <p className="text-2xl font-extrabold text-ink">{summary.totals.open}</p>
            </article>
            <article className="rounded-2xl border border-sky-100 bg-cloud p-3">
              <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Generate</p>
              <p className="text-2xl font-extrabold text-ink">{summary.totals.generate}</p>
            </article>
            <article className="rounded-2xl border border-sky-100 bg-cloud p-3">
              <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Export</p>
              <p className="text-2xl font-extrabold text-ink">{summary.totals.export}</p>
            </article>
          </div>
        ) : null}

        <div className="mb-6 rounded-2xl border border-sky-100 bg-white p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-moss">Campañas WhatsApp</p>
              <h3 className="text-lg font-extrabold text-ink">Embudo por campaña</h3>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-slate-600">Rango:</span>
              {[14, 30, 60].map((option) => (
                <button
                  key={option}
                  className={
                    campaignDays === option
                      ? 'rounded-lg bg-sky px-2.5 py-1.5 text-xs font-bold text-white'
                      : 'rounded-lg border border-sky-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700'
                  }
                  onClick={() => setCampaignDays(option)}
                  type="button"
                >
                  {option}d
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-sky-100 bg-white">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-sky-100 bg-sky-50/70 text-left">
                  <th className="py-2 pl-3 pr-3">Campaña</th>
                  <th className="py-2 pr-3">Mensaje</th>
                  <th className="py-2 pr-3">Open únicos</th>
                  <th className="py-2 pr-3">Generate únicos</th>
                  <th className="py-2 pr-3">Conversión</th>
                  <th className="py-2 pr-3">Eventos</th>
                </tr>
              </thead>
              <tbody>
                {(campaigns?.items ?? []).map((item: any) => (
                  <tr
                    className="cursor-pointer border-b border-sky-50 hover:bg-sky-50/50"
                    key={item.campaignKey}
                    onClick={() => {
                      setSelectedCampaign({
                        utmCampaign: item.utmCampaign,
                        mcMsgId: item.mcMsgId,
                        campaignKey: item.campaignKey,
                      });
                      setCampaignContactsPage(1);
                    }}
                  >
                    <td className="py-2 pl-3 pr-3 font-semibold text-ink">{item.utmCampaign}</td>
                    <td className="py-2 pr-3">{item.mcMsgId ?? '-'}</td>
                    <td className="py-2 pr-3">{item.openUniqueCids}</td>
                    <td className="py-2 pr-3">{item.generateUniqueCids}</td>
                    <td className="py-2 pr-3">{pct(item.conversionGenerateOverOpen ?? 0)}</td>
                    <td className="py-2 pr-3">{item.totalEvents}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex items-center justify-between">
            <button
              className="rounded-xl border border-sky-200 bg-white px-3 py-2 text-sm font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-50"
              disabled={campaignPage <= 1}
              onClick={() => setCampaignPage((prev) => Math.max(1, prev - 1))}
              type="button"
            >
              Anterior
            </button>
            <p className="text-sm text-slate-600">
              Página {campaignPage} de {campaignTotalPages}
            </p>
            <button
              className="rounded-xl border border-sky-200 bg-white px-3 py-2 text-sm font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-50"
              disabled={campaignPage >= campaignTotalPages}
              onClick={() => setCampaignPage((prev) => Math.min(campaignTotalPages, prev + 1))}
              type="button"
            >
              Siguiente
            </button>
          </div>

          {selectedCampaign ? (
            <div className="mt-4 rounded-xl border border-sky-100 bg-cloud p-3">
              <p className="text-sm font-bold text-ink">
                Detalle campaña: {selectedCampaign.utmCampaign} ({selectedCampaign.mcMsgId ?? '-'})
              </p>
              <div className="mt-2 overflow-x-auto rounded-lg border border-sky-100 bg-white">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="border-b border-sky-100 bg-sky-50/60 text-left">
                      <th className="px-2 py-2">CID</th>
                      <th className="px-2 py-2">Primer uso</th>
                      <th className="px-2 py-2">Último uso</th>
                      <th className="px-2 py-2">Open</th>
                      <th className="px-2 py-2">Generate</th>
                      <th className="px-2 py-2">Export</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(campaignContacts?.items ?? []).map((item: any) => (
                      <tr key={item.cid} className="border-b border-sky-50">
                        <td className="px-2 py-2 font-semibold text-ink">{item.cid}</td>
                        <td className="px-2 py-2">{new Date(item.firstSeen).toLocaleString()}</td>
                        <td className="px-2 py-2">{new Date(item.lastSeen).toLocaleString()}</td>
                        <td className="px-2 py-2">{item.openCount}</td>
                        <td className="px-2 py-2">{item.generateCount}</td>
                        <td className="px-2 py-2">{item.exportCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <button
                  className="rounded-lg border border-sky-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={campaignContactsPage <= 1}
                  onClick={() => setCampaignContactsPage((prev) => Math.max(1, prev - 1))}
                  type="button"
                >
                  Anterior
                </button>
                <p className="text-xs text-slate-600">
                  Página {campaignContactsPage} de {campaignContactsTotalPages}
                </p>
                <button
                  className="rounded-lg border border-sky-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={campaignContactsPage >= campaignContactsTotalPages}
                  onClick={() => setCampaignContactsPage((prev) => Math.min(campaignContactsTotalPages, prev + 1))}
                  type="button"
                >
                  Siguiente
                </button>
              </div>
            </div>
          ) : null}
        </div>

        {summary ? (
          <div className="mb-5 grid gap-3 sm:grid-cols-2">
            {(summary.usageBySource ?? []).map((item: { source: string; total: number }) => (
              <article className="rounded-2xl border border-sky-100 bg-white p-3" key={item.source}>
                <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Fuente</p>
                <p className="text-base font-bold text-ink">{item.source === 'guest' ? 'Guest' : 'WhatsApp'}</p>
                <p className="text-sm text-slate-600">{item.total} eventos</p>
              </article>
            ))}
          </div>
        ) : null}

        <div className="mb-4 flex flex-wrap gap-2">
          {[
            { id: 'all', label: 'Todos' },
            { id: 'whatsapp', label: 'WhatsApp' },
            { id: 'guest', label: 'Guest' },
          ].map((item) => (
            <button
              className={
                sourceFilter === item.id
                  ? 'rounded-xl bg-gradient-to-r from-coral to-moss px-3 py-2 text-sm font-bold text-white shadow-[0_10px_24px_rgba(15,139,255,0.28)]'
                  : 'rounded-xl border border-sky-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700'
              }
              key={item.id}
              onClick={() => setSourceFilter(item.id as 'all' | 'whatsapp' | 'guest')}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="overflow-x-auto rounded-2xl border border-sky-100 bg-white">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-sky-100 bg-sky-50/70 text-left">
                <th className="py-2 pl-3 pr-3">CID</th>
                <th className="py-2 pr-3">Fuente</th>
                <th className="py-2 pr-3">Primer uso</th>
                <th className="py-2 pr-3">Último uso</th>
                <th className="py-2 pr-3">Open</th>
                <th className="py-2 pr-3">Generate</th>
                <th className="py-2 pr-3">Export</th>
              </tr>
            </thead>
            <tbody>
              {(contacts?.items ?? []).map((item: any) => (
                <tr className="cursor-pointer border-b border-sky-50 hover:bg-sky-50/50" key={item.cid} onClick={() => setSelectedCid(item.cid)}>
                  <td className="py-2 pl-3 pr-3 font-semibold text-ink">{item.cid}</td>
                  <td className="py-2 pr-3">
                    <span className="rounded-lg border border-sky-200 bg-sky-50 px-2 py-1 text-xs font-semibold uppercase text-sky-700">
                      {item.source ?? (item.cid.startsWith('guest_') ? 'guest' : 'whatsapp')}
                    </span>
                  </td>
                  <td className="py-2 pr-3">{new Date(item.firstSeen).toLocaleString()}</td>
                  <td className="py-2 pr-3">{new Date(item.lastSeen).toLocaleString()}</td>
                  <td className="py-2 pr-3">{item.openCount}</td>
                  <td className="py-2 pr-3">{item.generateCount}</td>
                  <td className="py-2 pr-3">{item.exportCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <button
            className="rounded-xl border border-sky-200 bg-white px-3 py-2 text-sm font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-50"
            disabled={page <= 1}
            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            type="button"
          >
            Anterior
          </button>
          <p className="text-sm text-slate-600">
            Página {page} de {totalPages}
          </p>
          <button
            className="rounded-xl border border-sky-200 bg-white px-3 py-2 text-sm font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-50"
            disabled={page >= totalPages}
            onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
            type="button"
          >
            Siguiente
          </button>
        </div>
      </section>

      <aside className="rounded-[1.8rem] border border-sky-100 bg-white/85 p-5 shadow-[0_20px_46px_rgba(38,99,170,0.14)] backdrop-blur-xl md:p-6">
        <h3 className="text-lg font-extrabold text-ink">Detalle por CID</h3>
        {!selectedCid ? <p className="mt-2 text-sm text-slate-600">Selecciona un contacto para ver su timeline.</p> : null}

        {selectedDetail ? (
          <div className="mt-4 space-y-4">
            <div className="rounded-xl border border-sky-100 bg-cloud p-3 text-sm">
              <p className="font-semibold text-ink">{selectedDetail.cid}</p>
              <p>Fuente: {selectedDetail.source ?? (selectedDetail.cid?.startsWith('guest_') ? 'guest' : 'whatsapp')}</p>
              <p>Open: {selectedDetail.stats.open}</p>
              <p>Generate: {selectedDetail.stats.generate}</p>
              <p>Export: {selectedDetail.stats.export}</p>
            </div>

            <div className="max-h-[560px] overflow-y-auto rounded-xl border border-sky-100 bg-white p-3">
              {(selectedDetail.events ?? []).map((event: any) => (
                <article className="mb-3 border-b border-sky-50 pb-2 text-xs" key={event.id}>
                  <p className="font-bold uppercase text-ink">{event.event}</p>
                  <p className="text-slate-600">{new Date(event.createdAt).toLocaleString()}</p>
                  {event.meta ? (
                    <pre className="mt-1 overflow-x-auto rounded bg-sky-50 p-2 text-[11px] text-slate-700">{JSON.stringify(event.meta, null, 2)}</pre>
                  ) : null}
                </article>
              ))}
            </div>
          </div>
        ) : selectedCid ? (
          <p className="mt-2 text-sm text-slate-600">Cargando detalle...</p>
        ) : null}
      </aside>
    </div>
  );
};
