export default function Header({ auth }) {
  return (
    <header className="topbar">
      <div className="wrap bar">
        <span className="brand">Registre des diplômes</span>
        {auth.email && (
          <div className="row">
            <span className="chip" title={auth.email}>
              <i className="dot" />
              {auth.email}
            </span>
            <button className="btn ghost" onClick={auth.logout}>
              Déconnexion
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
