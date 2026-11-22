import { useCallback, useEffect, useMemo, useState } from 'react';
import { sha256Hex, shortHash } from '../utils/hash';
import { api } from '../utils/api';
import LoginForm from './LoginForm';

const EMPTY = { nom: '', prenom: '', filiere: '', annee: new Date().getFullYear() };
const fmtDate = (iso) => new Date(iso).toLocaleDateString('fr-FR');

export default function AdminPanel({ auth }) {
  const [form, setForm] = useState(EMPTY);
  const [file, setFile] = useState(null);
  const [hash, setHash] = useState('');
  const [busy, setBusy] = useState('');
  const [log, setLog] = useState(null);
  const [list, setList] = useState([]);

  const fileUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => fileUrl && URL.revokeObjectURL(fileUrl), [fileUrl]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const formOk = form.nom.trim() && form.prenom.trim() && form.filiere.trim() && Number(form.annee) > 1900;

  const refresh = useCallback(async () => {
    try {
      setList(await api.list());
    } catch (e) {
      if (e.status === 401) auth.logout();
      else setLog({ type: 'bad', text: e.message });
    }
  }, [auth]);

  useEffect(() => {
    if (auth.email) refresh();
  }, [auth.email]); // eslint-disable-line react-hooks/exhaustive-deps

  async function pick(f) {
    if (!f) return;
    setFile(f);
    setHash(await sha256Hex(f));
    setLog(null);
  }

  async function generate() {
    const { genererDiplomePdf } = await import('../utils/pdf'); // loaded only when needed
    await pick(genererDiplomePdf(form));
  }

  async function run(label, fn) {
    setBusy(label);
    setLog(null);
    try {
      await fn();
    } catch (e) {
      if (e.status === 401) auth.logout();
      else setLog({ type: 'bad', text: e.message });
    } finally {
      setBusy('');
    }
  }

  const emit = () =>
    run('issue', async () => {
      const body = new FormData();
      Object.entries(form).forEach(([k, v]) => body.append(k, String(v).trim()));
      body.append('file', file, file.name);
      const d = await api.issue(body);
      setLog({ type: 'ok', text: `Diplôme de ${d.prenom} ${d.nom} enregistré.` });
      reset(false);
      await refresh();
    });

  const revoke = (d) => {
    if (!window.confirm(`Révoquer le diplôme de ${d.prenom} ${d.nom} ? Cette action est définitive.`)) return;
    run('revoke:' + d.hash, async () => {
      await api.revoke(d.hash);
      setLog({ type: 'ok', text: 'Diplôme révoqué.' });
      await refresh();
    });
  };

  function reset(clearLog = true) {
    setForm(EMPTY);
    setFile(null);
    setHash('');
    if (clearLog) setLog(null);
  }

  if (auth.checking) return <section className="panel gate"><p>Chargement…</p></section>;
  if (!auth.email) return <LoginForm onLogin={auth.login} />;

  const step = (done) => `step${done ? ' done' : ''}`;

  return (
    <section className="panel">
      <ol className="steps">
        <li className={step(formOk)}>
          <h2>Étudiant</h2>
          <div className="grid">
            <label>
              Nom
              <input value={form.nom} onChange={set('nom')} autoComplete="off" />
            </label>
            <label>
              Prénom
              <input value={form.prenom} onChange={set('prenom')} autoComplete="off" />
            </label>
            <label>
              Filière
              <input value={form.filiere} onChange={set('filiere')} placeholder="Licence en Informatique" />
            </label>
            <label>
              Année
              <input type="number" value={form.annee} onChange={set('annee')} />
            </label>
          </div>
        </li>

        <li className={step(file)}>
          <h2>Fichier PDF</h2>
          <div className="row">
            <label className="btn ghost">
              Importer un PDF
              <input type="file" accept="application/pdf,.pdf" hidden onChange={(e) => pick(e.target.files[0])} />
            </label>
            <button className="btn ghost" disabled={!formOk} onClick={generate}>
              Générer depuis le formulaire
            </button>
          </div>
          {file && (
            <dl>
              <dt>Fichier</dt>
              <dd>
                {file.name} (<a href={fileUrl} download={file.name}>télécharger</a>)
              </dd>
              <dt>Empreinte SHA-256</dt>
              <dd className="mono">{hash}</dd>
            </dl>
          )}
        </li>

        <li className={step(false)}>
          <h2>Enregistrement</h2>
          <div className="row">
            <button className="btn" disabled={!file || !formOk || busy} onClick={emit}>
              {busy === 'issue' ? 'Enregistrement…' : 'Émettre le diplôme'}
            </button>
            <button className="btn ghost" onClick={() => reset()}>
              Nouveau diplôme
            </button>
          </div>
        </li>
      </ol>

      {log && (
        <p className={`notice ${log.type}`} role="status">
          {log.text}
        </p>
      )}

      <div className="revoke">
        <h2>Diplômes émis ({list.length})</h2>
        {list.length === 0 ? (
          <p>Aucun diplôme pour l’instant.</p>
        ) : (
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Étudiant</th>
                  <th>Filière</th>
                  <th>Année</th>
                  <th>Émis le</th>
                  <th>Empreinte</th>
                  <th>Statut</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.map((d) => (
                  <tr key={d.hash}>
                    <td>
                      {d.prenom} {d.nom}
                    </td>
                    <td>{d.filiere}</td>
                    <td>{d.annee}</td>
                    <td>{fmtDate(d.issuedAt)}</td>
                    <td className="mono" title={d.hash}>
                      {shortHash(d.hash)}
                    </td>
                    <td>
                      <span className={`tag ${d.revoked ? 'bad' : 'ok'}`}>{d.revoked ? 'Révoqué' : 'Valide'}</span>
                    </td>
                    <td className="actions">
                      <a href={d.fileUrl} target="_blank" rel="noreferrer">
                        PDF
                      </a>
                      {!d.revoked && (
                        <button className="btn danger sm" disabled={busy} onClick={() => revoke(d)}>
                          Révoquer
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
