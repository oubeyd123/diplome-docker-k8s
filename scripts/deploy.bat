@echo off
REM Deploys the project on Minikube. Run from PowerShell/CMD (.\deploy.bat) or double-click.
REM Works from the project root or from the scripts\ folder.
REM Prerequisites: Docker Desktop running, minikube and kubectl installed.
setlocal
cd /d "%~dp0"
if not exist "api\Dockerfile" cd ..
if not exist "api\Dockerfile" (
  echo Cannot find the api folder. Put deploy.bat in the project folder next to api, frontend and k8s.
  goto :fail
)

echo.
echo ==^> 1/4 Checking Minikube
minikube status >nul 2>&1
if errorlevel 1 (
  echo     Minikube is not running, starting it...
  minikube start --driver=docker
  if errorlevel 1 goto :fail
) else (
  echo     Minikube is already running.
)

echo.
echo ==^> 2/4 Building the images inside Minikube (first time: a few minutes)
call :build diplome-api 1.0 api
if errorlevel 1 goto :fail
call :build diplome-frontend 1.0 frontend
if errorlevel 1 goto :fail

echo.
echo ==^> 3/4 Applying the Kubernetes manifests
kubectl apply -f k8s/
if errorlevel 1 goto :fail

echo.
echo ==^> 4/4 Waiting for the pods to be ready
kubectl -n diplomes rollout status deployment/mongo --timeout=180s
if errorlevel 1 goto :fail
kubectl -n diplomes rollout status deployment/api --timeout=180s
if errorlevel 1 goto :fail
kubectl -n diplomes rollout status deployment/frontend --timeout=120s
if errorlevel 1 goto :fail

echo.
kubectl -n diplomes get pods,svc,pvc
echo.
echo Done. Opening the site: KEEP THIS WINDOW OPEN (closing it cuts the connection).
echo Login: admin@univ.local / admin1234
minikube service frontend -n diplomes
goto :end

:build
REM %1 = image name, %2 = tag, %3 = folder.
REM "minikube image build" can print an error yet return 0, so we check the image really exists.
minikube image build -t %1:%2 ./%3
minikube image ls | findstr /c:"%1:%2" >nul
if not errorlevel 1 exit /b 0
echo     Image %1:%2 not found in Minikube, trying docker build + minikube image load...
docker build -t %1:%2 ./%3
if errorlevel 1 exit /b 1
minikube image load %1:%2
minikube image ls | findstr /c:"%1:%2" >nul
if errorlevel 1 (
  echo     Could not put %1:%2 into Minikube.
  exit /b 1
)
exit /b 0

:fail
echo.
echo *** A step failed. Read the error above. Useful commands:
echo     kubectl -n diplomes get pods
echo     kubectl -n diplomes describe pod ^<pod-name^>
echo     kubectl -n diplomes logs deploy/api
pause
exit /b 1

:end
pause