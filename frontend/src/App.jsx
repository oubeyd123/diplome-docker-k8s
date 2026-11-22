import { useState } from 'react';
import Header from './components/Header';
import Rosette from './components/Rosette';
import VerifyPanel from './components/VerifyPanel';
import AdminPanel from './components/AdminPanel';
import { useAuth } from './hooks/useAuth';

export default function App() {
  const auth = useAuth();
  const [tab, setTab] = useState('verify');

  return (
    <>
      <Header auth={auth} />
      <main className="wrap">
        <section className="hero">
          <div>
            <h1>Déposez un diplôme. Le registre dit s’il est authentique.</h1>
            <p className="lead">
              Chaque diplôme émis par l’université est enregistré sous forme d’empreinte numérique. Le fichier est
              analysé dans votre navigateur et n’est envoyé nulle part : seule l’empreinte est comparée au registre.
            </p>
          </div>
          <Rosette />
        </section>

        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'verify'} onClick={() => setTab('verify')}>
            Vérifier un diplôme
          </button>
          <button role="tab" aria-selected={tab === 'admin'} onClick={() => setTab('admin')}>
            Espace université
          </button>
        </div>

        {tab === 'verify' ? <VerifyPanel /> : <AdminPanel auth={auth} />}
      </main>
      <footer className="wrap foot">Projet pédagogique : les diplômes enregistrés ici n’ont pas de valeur légale.</footer>
    </>
  );
}
