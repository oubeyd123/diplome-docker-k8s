# Registre des diplômes — Conteneurisation et orchestration (Docker & Kubernetes)

Mini-projet « Proposition 2 : Conteneurisation et Orchestration locale vs Cloud ».

Une application micro-services de **vérification de diplômes** est conteneurisée avec Docker, lancée localement avec Docker Compose, puis déployée et mise à l'échelle sur **Kubernetes (Minikube)**.

---

## Sommaire

1. [Objectif](#1-objectif)
2. [L'application](#2-lapplication)
3. [Architecture](#3-architecture)
4. [Structure du dépôt](#4-structure-du-dépôt)
5. [Partie 1 : Docker et Docker Compose](#5-partie-1--docker-et-docker-compose)
6. [Partie 2 : Kubernetes (Minikube)](#6-partie-2--kubernetes-minikube)
7. [Tests de scalabilité et de résilience](#7-tests-de-scalabilité-et-de-résilience)
8. [Volumes, données persistantes et réseau](#8-volumes-données-persistantes-et-réseau)
9. [Sécurité](#9-sécurité)
10. [Choix techniques](#10-choix-techniques)
11. [Problèmes rencontrés et solutions](#11-problèmes-rencontrés-et-solutions)
12. [Limites et améliorations possibles](#12-limites-et-améliorations-possibles)
13. [Correspondance avec la grille de notation](#13-correspondance-avec-la-grille-de-notation)
14. [Dépannage](#14-dépannage)

---

## 1. Objectif

Passer de la virtualisation lourde (machines virtuelles) à la **conteneurisation légère** :

- **Conteneuriser** chaque composant (front-end, API, base de données) avec Docker ;
- **Composer** l'ensemble en local avec Docker Compose ;
- **Orchestrer** les conteneurs avec Kubernetes : déploiement, services, stockage persistant, **redimensionnement du nombre de réplicas**, reprise automatique après panne.

Un conteneur partage le noyau de la machine hôte : il démarre en quelques secondes, pèse quelques dizaines de Mo (contre plusieurs Go pour une VM) et s'exécute de façon identique partout.

## 2. L'application

Le **Registre des diplômes** permet de vérifier qu'un diplôme au format PDF est authentique.

**Principe :** l'empreinte numérique **SHA-256** d'un fichier est unique ; modifier un seul octet change totalement l'empreinte. L'université enregistre l'empreinte de chaque diplôme émis ; pour vérifier un document, on calcule son empreinte et on la cherche dans le registre.

| Fonction | Qui | Description |
|---|---|---|
| **Vérifier** | public | On dépose un PDF. L'empreinte est calculée **dans le navigateur** (le fichier n'est jamais envoyé) et seule l'empreinte est envoyée à l'API. Résultat : *authentique*, *révoqué* ou *aucune correspondance*. |
| **Émettre** | administrateur | Après connexion, on saisit l'étudiant et on importe ou génère un PDF. Le serveur recalcule lui-même l'empreinte, stocke le PDF et les métadonnées. |
| **Révoquer** | administrateur | Un diplôme émis peut être annulé ; il apparaît alors comme « révoqué ». |

Technologies : React 18 + Vite (front-end), Node.js 20 + Express 5 + Mongoose (API), MongoDB 7 (base de données, PDF stockés via GridFS).

### API REST

| Méthode | Route | Authentification | Rôle |
|---|---|---|---|
| GET | `/api/health` | – | État de l'API (200 si MongoDB est connecté), utilisé par les sondes |
| GET | `/api/verify/:hash` | – | `{status: valid \| revoked \| unknown, diploma?}` |
| GET | `/api/diplomas/:hash/file` | – | PDF original |
| POST | `/api/auth/login` | – | `{email, password}` → jeton JWT |
| GET | `/api/diplomas` | admin | Liste des diplômes |
| POST | `/api/diplomas` | admin | Émission (multipart : `file`, `nom`, `prenom`, `filiere`, `annee`) |
| POST | `/api/diplomas/:hash/revoke` | admin | Révocation |

### Comment le front-end parle à l'API

Le navigateur appelle toujours des URL **relatives** (`/api/...`) via `fetch` (tout le code réseau est dans `frontend/src/utils/api.js`). Le serveur web **nginx** reçoit la requête et la redirige vers le service `api` (`proxy_pass http://api:4000`). Le front-end ne connaît donc ni l'adresse de l'API ni celle de la base, ce qui évite aussi les problèmes de CORS et permet à Kubernetes de placer 1 ou 5 pods d'API derrière le même nom `api`.

## 3. Architecture

```
                    Navigateur
                        │  http://localhost:8080  (Compose)  /  minikube service (K8s)
                        ▼
            ┌───────────────────────┐
            │  frontend  (nginx)    │  fichiers statiques React, port 8080
            │  /api  ──► proxy      │
            └──────────┬────────────┘
                       │  http://api:4000
                       ▼
            ┌───────────────────────┐
            │  api  (Node/Express)  │  logique métier, JWT, validation
            └──────────┬────────────┘
                       │  mongodb://mongo:27017
                       ▼
            ┌───────────────────────┐
            │  mongo  (MongoDB 7)   │  collections + GridFS
            └──────────┬────────────┘
                       ▼
               Volume persistant
        (Docker : mongo-data / K8s : PVC)
```

| Composant | Image | Rôle | Exposé à l'extérieur |
|---|---|---|---|
| frontend | `diplome-frontend:1.0` (nginx) | site + reverse proxy | **oui** (port 8080 / NodePort 30080) |
| api | `diplome-api:1.0` (Node 20 alpine) | API REST, **sans état** | non |
| mongo | `mongo:7` (image officielle) | base de données | non |

## 4. Structure du dépôt

```
.
├── api/                     API Express
│   ├── Dockerfile           build multi-stage, utilisateur non-root
│   ├── src/                 routes, modèles Mongoose, middleware JWT
│   └── test/api.test.js     test d'intégration (MongoDB en mémoire)
├── frontend/                application React
│   ├── Dockerfile           build multi-stage (Node → nginx non-root)
│   ├── nginx.conf           fichiers statiques + proxy /api
│   └── src/
├── docker-compose.yml       Partie 1 : exécution locale des 3 conteneurs
├── k8s/                     Partie 2 : manifestes Kubernetes
│   ├── 00-namespace.yaml
│   ├── 01-secret.yaml
│   ├── 10-mongo.yaml        PVC + Deployment + Service
│   ├── 20-api.yaml          Deployment + Service + HPA (2 à 6 réplicas automatiques)
│   ├── 30-frontend.yaml     Deployment + Service NodePort
├── deploy.bat               déploiement automatisé sous Windows
├── scripts/deploy.sh        même chose sous Bash
├── scripts/demo.sh          scénario de démonstration (Bash)
└── .env.example             variables pour Docker Compose
```

## 5. Partie 1 : Docker et Docker Compose

### 5.1 Dockerfile : choix d'optimisation

**`frontend/Dockerfile`**, build en deux étapes :

1. étape `build` (`node:20-alpine`) : `npm ci` puis `npm run build` ;
2. étape finale (`nginxinc/nginx-unprivileged:1.27-alpine`) : on ne copie **que** le dossier `dist/` produit. Node, `node_modules` et le code source ne se retrouvent pas dans l'image finale.

**`api/Dockerfile`**, build en deux étapes :

1. étape `deps` : `npm ci --omit=dev` (aucune dépendance de développement) ;
2. étape finale : on copie `node_modules` et `src/`.

Bonnes pratiques appliquées aux deux images :

| Pratique | Intérêt |
|---|---|
| **Multi-stage build** | image finale sans outils de build, plus petite et avec une surface d'attaque réduite |
| **Images de base `alpine`** | quelques Mo au lieu de plusieurs centaines |
| **Ordre des couches** : `COPY package*.json` + `npm ci` avant `COPY . .` | le cache Docker évite de réinstaller les dépendances à chaque modification du code |
| **`.dockerignore`** (`node_modules`, `dist`, `.env*`…) | contexte de build léger, aucun secret copié par erreur |
| **Utilisateur non-root** (`USER node` ; image nginx « unprivileged », port 8080) | un attaquant qui compromet le conteneur n'a pas les droits root |
| **`HEALTHCHECK`** | Docker connaît l'état réel du service |
| `npm ci` plutôt que `npm install` | installation reproductible à partir du `package-lock.json` |

Comparer les tailles : `docker image ls` (ou `minikube image ls`).

### 5.2 docker-compose.yml

Le fichier lance les trois services :

- **frontend** : port publié `8080:8080`, démarre quand l'API est saine ;
- **api** : variables d'environnement (URI MongoDB, secret JWT, compte admin), démarre quand MongoDB est sain ;
- **mongo** : volume nommé `mongo-data` monté sur `/data/db`, authentification activée, healthcheck `mongosh`.

Les conteneurs se joignent par **nom de service** (`mongo`, `api`) grâce au DNS interne du réseau Compose.

**Lancement :**

```bash
cp .env.example .env            # puis modifier les mots de passe
docker compose up --build
```

Application : <http://localhost:8080> (compte de démonstration : voir §14).

**Vérifications utiles :**

```bash
docker compose ps                              # états et healthchecks
docker compose down && docker compose up -d    # les données sont conservées (volume)
docker compose down -v                         # supprime aussi les données
```

## 6. Partie 2 : Kubernetes (Minikube)

### 6.1 Prérequis

- Docker Desktop **démarré** ;
- `minikube` et `kubectl` installés ;
- un cluster démarré : `minikube start --driver=docker`.

Versions utilisées : Minikube 1.39, Kubernetes 1.37 (runtime *containerd*), kubectl 1.34.

### 6.2 Déploiement

**Windows (PowerShell ou CMD) :**

```powershell
.\deploy.bat
```

**Bash (Git Bash, Linux, macOS) :**

```bash
bash scripts/deploy.sh
```

Le script : démarre Minikube si besoin, **construit les images dans Minikube**, applique `k8s/`, attend que les pods soient prêts. Ensuite :

```powershell
minikube service frontend -n diplomes     # ouvre le site (garder la fenêtre ouverte)
```

**Équivalent manuel, étape par étape :**

```powershell
minikube image build -t diplome-api:1.0 ./api
minikube image build -t diplome-frontend:1.0 ./frontend
kubectl apply -f k8s/
kubectl -n diplomes get pods
minikube service frontend -n diplomes
```

### 6.3 Comment les images arrivent dans le cluster

| Image | Origine | Chemin vers le cluster |
|---|---|---|
| `diplome-api:1.0`, `diplome-frontend:1.0` | construites à partir de nos Dockerfile | `minikube image build` les stocke dans Minikube ; les manifestes les nomment avec `imagePullPolicy: IfNotPresent` (utiliser la copie locale) |
| `mongo:7` | image publique Docker Hub | Kubernetes la télécharge automatiquement au premier démarrage du pod |

Kubernetes ne manipule jamais les Dockerfile ni le code source : seules les **images** comptent à l'exécution. Le Dockerfile ne sert qu'une fois, à construire l'image.

En production (EKS), on pousserait les images dans un registre (ECR) et les manifestes les référenceraient depuis ce registre.

### 6.4 Objets Kubernetes déployés

| Fichier | Objets | Détails |
|---|---|---|
| `00-namespace.yaml` | Namespace `diplomes` | regroupe et isole les ressources du projet |
| `01-secret.yaml` | Secret `diplomes-secret` | identifiants MongoDB, secret JWT, compte admin |
| `10-mongo.yaml` | PVC `mongo-data` (1 Gi), Deployment `mongo`, Service `mongo` | 1 réplique, stratégie `Recreate`, volume monté sur `/data/db`, sonde de disponibilité `mongosh` |
| `20-api.yaml` | Deployment `api`, Service `api`, HPA `api` (**2 à 6 réplicas** selon le CPU) | sondes *readiness* et *liveness* sur `/api/health`, requêtes/limites CPU et mémoire |
| `30-frontend.yaml` | Deployment `frontend`, Service `frontend` (NodePort 30080) | **2 réplicas**, sondes *readiness* et *liveness*, limites CPU et mémoire ; seul composant joignable depuis l'extérieur |

**Correspondance Docker Compose → Kubernetes :**

| Compose | Kubernetes |
|---|---|
| service | Deployment + Service |
| volume `mongo-data` | PersistentVolumeClaim |
| fichier `.env` | Secret |
| `healthcheck` | sondes readiness / liveness |
| réseaux `web` / `data` | Services `ClusterIP` (non exposés) + un seul `NodePort` |
| nom de service `api` dans `nginx.conf` | Service `api` du namespace (**aucun changement de code**) |

## 7. Tests de scalabilité et de résilience

Toutes les commandes s'exécutent après le déploiement.

### 7.1 Redimensionner le nombre de réplicas

Le nombre de pods de l'API est géré par le HPA de `k8s/20-api.yaml` (minimum 2, maximum 6). Pour changer ces bornes :

```powershell
kubectl -n diplomes patch hpa api -p '{\"spec\":{\"minReplicas\":5}}'
kubectl -n diplomes get pods -l app=api
```

Kubernetes compare l'état souhaité (5) à l'état réel (2) et crée 3 pods supplémentaires. Retour à 2 : `minReplicas` = 2 (ou `kubectl apply -f k8s/`). Un `kubectl scale` manuel serait annulé par le HPA.

L'API étant **sans état** (les sessions sont des jetons JWT vérifiés par signature, toutes les données sont dans MongoDB), n'importe quel réplica peut traiter n'importe quelle requête.

### 7.2 Répartition de la charge

Le Service `api` répartit les requêtes entre ses pods. `/api/health` renvoie le nom du pod qui a répondu :

```powershell
kubectl -n diplomes port-forward svc/frontend 8080:8080
# dans un autre terminal, répéter plusieurs fois :
curl.exe http://localhost:8080/api/health
```

Le champ `"host"` change d'une réponse à l'autre.

### 7.3 Reprise automatique (self-healing)

```powershell
kubectl -n diplomes get pods
kubectl -n diplomes delete pod <nom-d-un-pod-api>
kubectl -n diplomes get pods
```

Le Deployment constate qu'il manque un pod et en recrée un immédiatement.

### 7.4 Persistance des données

1. Se connecter, émettre un diplôme, noter le PDF.
2. Supprimer le pod de la base : `kubectl -n diplomes delete pod -l app=mongo`
3. Attendre que le nouveau pod soit `1/1 Running`.
4. Vérifier de nouveau le même PDF : il est toujours **authentique**.

Le nouveau pod MongoDB se rattache au même volume (PVC), donc les données survivent.

### 7.5 Mise à l'échelle automatique

`deploy.bat` active `metrics-server` (mesure du CPU). Le HPA ajoute des pods quand le CPU moyen dépasse 50 % de la requête (50m) et les retire environ 5 minutes après la fin de la charge.

```powershell
kubectl -n diplomes get hpa -w
```

Le script `scripts/demo.sh` (Bash) enchaîne les points 7.1 à 7.4 pas à pas.

## 8. Volumes, données persistantes et réseau

**Persistance**

- *Docker Compose* : volume nommé `mongo-data` monté dans `/data/db` ; `docker compose down` ne le supprime pas, seul `down -v` le fait.
- *Kubernetes* : `PersistentVolumeClaim` de 1 Gi ; Minikube crée automatiquement le volume (StorageClass `standard`). La stratégie `Recreate` du Deployment MongoDB arrête l'ancien pod avant de démarrer le nouveau, car le volume est en `ReadWriteOnce` (un seul pod à la fois).
- Les PDF sont stockés **dans MongoDB (GridFS)** : un seul volume contient donc toutes les données.

**Réseau inter-conteneurs**

- *Docker Compose* : deux réseaux. `web` (frontend ↔ api) et `data` (api ↔ mongo). Le frontend **ne peut pas** atteindre MongoDB, et seul le port 8080 du frontend est publié sur la machine.
- *Kubernetes* : MongoDB et l'API sont derrière des Services de type `ClusterIP` (joignables uniquement depuis l'intérieur du cluster, par leur nom `mongo` et `api`). Seul le frontend est un `NodePort`.

## 9. Sécurité

| Mesure | Détail |
|---|---|
| Mots de passe | hachés avec **bcrypt** |
| Authentification | **JWT** (HS256, expiration 12 h) exigé sur toutes les routes d'administration |
| Secrets | variables d'environnement (`.env` / Secret Kubernetes), **jamais dans les images** |
| Empreinte | recalculée **côté serveur** : on ne fait jamais confiance à une empreinte envoyée par le client |
| Fichiers | taille limitée à 5 Mo, vérification de la signature `%PDF-` |
| En-têtes HTTP | `helmet` |
| Limitation de débit | 20 tentatives de connexion / 15 min ; 60 vérifications / minute |
| Conteneurs | exécutés en utilisateur non-root |
| Réseau | base de données non exposée |

Les valeurs fournies (`example`, `admin1234`, secret JWT) sont des **valeurs de démonstration** à remplacer pour tout usage réel.

## 10. Choix techniques

- **Conteneurs plutôt que VM** : démarrage en secondes, images de quelques dizaines de Mo, environnement reproductible, consommation de ressources réduite car le noyau est partagé.
- **Multi-stage + alpine** : images petites et sans outils de build.
- **API sans état** : condition nécessaire pour la scalabilité horizontale ; plusieurs réplicas sans coordination.
- **MongoDB en 1 réplique** : une base de données n'est pas « scalable » en dupliquant simplement les pods ; il faudrait un *replica set* (voir §12).
- **Stratégie `Recreate` pour MongoDB** : volume `ReadWriteOnce`.
- **Sondes readiness / liveness** : un pod non prêt (par exemple, API pas encore connectée à MongoDB) ne reçoit pas de trafic ; un pod bloqué est redémarré.
- **Minikube** : cluster Kubernetes réel en local, sans compte cloud ni coût. Les manifestes sont portables vers EKS (voir §12).
- **Pas de blockchain** : la version initiale du projet enregistrait les empreintes sur une blockchain ; elle a été remplacée par une API et une base MongoDB, plus adaptées à l'objectif du projet (conteneurisation et orchestration).

## 11. Problèmes rencontrés et solutions

| Problème | Cause | Solution |
|---|---|---|
| `docker-env` échoue (`SSH_AGENT_START`) | Minikube utilise le runtime *containerd* ; la commande n'est pas supportée sous Windows | construction des images avec `minikube image build` |
| `minikube image build` : « failed to read dockerfile » | le `.dockerignore` listait `Dockerfile` ; `docker build` tolère cela, pas `minikube image build` | retrait de `Dockerfile` du `.dockerignore` |
| Pods en `ImagePullBackOff` | les images locales n'existaient pas dans Minikube, Kubernetes tentait de les télécharger depuis Docker Hub | construction des images dans Minikube ; `deploy.bat` vérifie désormais que chaque image existe avant de déployer |
| Course à la création du compte admin avec plusieurs réplicas | plusieurs pods d'API démarrent en même temps | l'erreur de clé dupliquée (code 11000) est ignorée |
| Frontend en `Error` juste après un redémarrage du cluster | nginx résout le nom `api` au démarrage, avant que le DNS du cluster soit prêt | Kubernetes redémarre le pod automatiquement jusqu'à succès (voir §12 pour une amélioration) |
| `minikube start` échoue | Docker Desktop non démarré | démarrer Docker Desktop avant Minikube |

## 12. Limites et améliorations possibles

- **Intégrité du registre** : en remplaçant la blockchain par une base de données classique, l'administrateur de la base peut techniquement modifier les enregistrements. La blockchain apportait cette garantie d'immutabilité.
- **Haute disponibilité de MongoDB** : passer à un *replica set* avec un `StatefulSet`.
- **Secrets** : stocker les identifiants hors du dépôt (Sealed Secrets, Vault, secrets du fournisseur cloud).
- **Exposition** : utiliser un `Ingress` avec TLS à la place du NodePort.
- **Réseau** : ajouter des `NetworkPolicy` (nécessite un CNI qui les applique).
- **Démarrage de nginx** : résolution DNS dynamique de `api` pour tolérer un DNS tardif.
- **Cloud (AWS EKS)** : pousser les images vers ECR, remplacer le NodePort par un Service `LoadBalancer`, utiliser un StorageClass EBS. Les manifestes restent les mêmes pour l'essentiel.
- **Mise à l'échelle automatique** : ajuster les seuils du HPA de `k8s/20-api.yaml` (CPU, mémoire, min/max).
- **CI/CD** : construction et publication automatiques des images.

## 13. Correspondance avec la grille de notation

| Critère | Où le trouver |
|---|---|
| Qualité des Dockerfile (multi-stage, légèreté) | `api/Dockerfile`, `frontend/Dockerfile`, `.dockerignore`, §5.1 |
| Composition et orchestration locale | `docker-compose.yml`, §5.2 |
| Déploiement sur l'orchestrateur | `k8s/`, `deploy.bat`, §6 et §7 |
| Volumes / données persistantes et réseau | PVC `mongo-data`, volume Compose, réseaux `web`/`data`, Services, §8 |
| Rapport technique et reproductibilité | ce document ; `deploy.bat` / `scripts/deploy.sh` ; `.env.example` |
| Démo live | §7, `scripts/demo.sh` |

## 14. Dépannage

| Symptôme | Action |
|---|---|
| `minikube start` : impossible de joindre Docker | démarrer Docker Desktop, attendre « Engine running » |
| Pod en `ImagePullBackOff` | `minikube image ls` : les images `diplome-*` y sont-elles ? Sinon relancer `deploy.bat` |
| Pod en `CrashLoopBackOff` | `kubectl -n diplomes logs <pod>` |
| Pod `Running` mais `0/1` | attendre ; l'API est prête quand elle est connectée à MongoDB |
| Frontend en `Error` après un redémarrage | attendre 1 à 2 minutes ; sinon `kubectl -n diplomes rollout restart deployment frontend` |
| Le site ne s'ouvre pas | relancer `minikube service frontend -n diplomes` et garder la fenêtre ouverte |
| Comprendre une panne | `kubectl -n diplomes describe pod <pod>` (section *Events*) |
| Tout supprimer | `kubectl delete namespace diplomes` (données comprises) |

**Comptes de démonstration**

- Site (Espace université) : `admin@univ.local` / `admin1234`
- MongoDB (interne) : `root` / `example`

Ces valeurs sont définies dans `k8s/01-secret.yaml` (Kubernetes) et par défaut dans `docker-compose.yml` (modifiables via `.env`).

**Tests automatiques de l'API** (nécessite Node.js 20+, télécharge un MongoDB temporaire) :

```bash
cd api && npm install && npm test
```

Parcours couvert par le test : émission → vérification → téléchargement → doublon refusé → révocation → fichier modifié non reconnu.
