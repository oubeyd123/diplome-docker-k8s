import { useRef, useState } from 'react';
import { sha256Hex } from '../utils/hash';
import { api } from '../utils/api';

const fmtDate = (iso) => new Date(iso).toLocaleDateString('fr-FR', { dateStyle: 'long' });

const VERDICT = {
  valid: { cls: 'ok', title: 'Diplôme authentique', text: 'Ce fichier correspond exactement à un diplôme émis par l’université.' },
  revoked: { cls: 'bad', title: 'Diplôme révoqué', text: 'Ce diplôme a bien été émis, puis annulé par l’université. Il n’est plus valide.' },
  unknown: {
    cls: 'bad',
    title: 'Aucune correspondance',
    text: 'Ce fichier n’est pas enregistré. Il n’a jamais été émis par l’université, ou il a été modifié, même d’un seul octet.',
  },
};

export default function VerifyPanel() {
  const [res, setRes] = useState({ status: 'idle' });
  const [over, setOver] = useState(false);
  const input = useRef(null);

  async function handleFile(file) {
    if (!file) return;
    setRes({ status: 'loading', fileName: file.name });
    try {
      if (!file.name.toLowerCase().endsWith('.pdf')) throw new Error('Déposez un fichier PDF.');
      const hash = await sha256Hex(file);
      const r = await api.verify(hash);
      setRes({ status: r.status, hash, fileName: file.name, d: r.diploma });
    } catch (e) {
      setRes({ status: 'error', message: e.message });
    }
  }

  const v = VERDICT[res.status];

  return (
    <section className="panel">
      <div
        className={`drop${over ? ' over' : ''}`}
        role="button"
        tabIndex={0}
        onClick={() => input.current.click()}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          handleFile(e.dataTransfer.files[0]);
        }}
      >
        <input ref={input} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => handleFile(e.target.files[0])} />
        <strong>{res.status === 'loading' ? `Vérification de ${res.fileName}…` : 'Glissez le diplôme PDF ici'}</strong>
        <span>ou cliquez pour choisir un fichier. Aucun envoi : l’empreinte est calculée sur votre appareil.</span>
      </div>

      {res.status === 'error' && (
        <p className="notice bad" role="alert">
          {res.message}
        </p>
      )}

      {v && (
        <article className="result" aria-live="polite">
          <div className={`stamp ${v.cls}`}>{v.title}</div>
          <p className="verdict">{v.text}</p>

          {res.d && (
            <dl>
              <dt>Étudiant</dt>
              <dd>
                {res.d.prenom} {res.d.nom}
              </dd>
              <dt>Filière</dt>
              <dd>{res.d.filiere}</dd>
              <dt>Année</dt>
              <dd>{res.d.annee}</dd>
              <dt>Émis le</dt>
              <dd>{fmtDate(res.d.issuedAt)}</dd>
              {res.d.revokedAt && (
                <>
                  <dt>Révoqué le</dt>
                  <dd>{fmtDate(res.d.revokedAt)}</dd>
                </>
              )}
              <dt>Original</dt>
              <dd>
                <a href={res.d.fileUrl} target="_blank" rel="noreferrer">
                  Ouvrir le diplôme original
                </a>
              </dd>
            </dl>
          )}
          <dl>
            <dt>Fichier</dt>
            <dd>{res.fileName}</dd>
            <dt>Empreinte SHA-256</dt>
            <dd className="mono">{res.hash}</dd>
          </dl>
        </article>
      )}
    </section>
  );
}
