@echo off
REM Deploys the project on Minikube.
REM Prerequisites: Docker Desktop running, minikube and kubectl installed.

REM --- Go to the project folder ---
REM %~dp0 is the folder of this script (scripts\), ".." is its parent (the project root),
REM so the paths ./api, ./frontend and k8s/ below work wherever the script is run from.
cd /d "%~dp0.."

REM --- Plain text output ---
REM Tells minikube to print plain text instead of emojis (they show as garbage in CMD).
set MINIKUBE_IN_STYLE=false

REM --- 1/4 Start the cluster ---
REM Creates (or reuses) a one-machine Kubernetes cluster running inside Docker Desktop.
REM If Minikube is already running, this command just confirms it.
echo ==^> 1/4 Starting Minikube
minikube start --driver=docker || goto :fail
REM metrics-server measures pod CPU; the autoscaler in k8s/20-api.yaml needs it to work.
minikube addons enable metrics-server || goto :fail

REM --- 2/4 Build the images ---
REM Builds our two images directly inside Minikube, because Minikube cannot see
REM the images of your normal Docker. The names and tags must match the "image:"
REM lines in k8s/20-api.yaml and k8s/30-frontend.yaml. (mongo:7 is downloaded automatically.)
echo ==^> 2/4 Building the images inside Minikube
minikube image build -t diplome-api:1.0 ./api || goto :fail
minikube image build -t diplome-frontend:1.0 ./frontend || goto :fail

REM --- 3/4 Deploy ---
REM Sends every file of the k8s\ folder to the cluster (namespace, secret, mongo, api, frontend).
REM Kubernetes then creates the pods, services and volume described in them.
echo ==^> 3/4 Applying the Kubernetes files
kubectl apply -f k8s/ || goto :fail

REM --- 4/4 Wait until everything is ready ---
REM Waits for each deployment's pods to pass their readiness probes, in the order
REM they depend on each other: database first, then API, then frontend.
echo ==^> 4/4 Waiting for the pods to be ready
kubectl -n diplomes rollout status deployment/mongo --timeout=180s || goto :fail
kubectl -n diplomes rollout status deployment/api --timeout=180s || goto :fail
kubectl -n diplomes rollout status deployment/frontend --timeout=120s || goto :fail

REM --- Show the result and open the site ---
REM Lists the pods and services, then opens a tunnel from your PC to the frontend
REM NodePort and opens the browser. Closing this window closes the tunnel.
kubectl -n diplomes get pods,svc
echo Done. Opening the site - KEEP THIS WINDOW OPEN. Login: admin@univ.local / admin1234
minikube service frontend -n diplomes
pause
exit /b 0

REM --- Error handling ---
REM Every step above jumps here with "|| goto :fail" if its command fails.
REM The script stops and shows commands that help find the cause.
:fail
echo *** A step failed. Check: kubectl -n diplomes get pods / describe pod ^<name^> / logs deploy/api
pause
exit /b 1