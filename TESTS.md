# Kubernetes tests

PowerShell, after `scripts\deploy.bat`. Use 3 windows: 2 to watch, 1 to run tests.

## Watch

```powershell
kubectl -n diplomes get pods -w      # pods appearing / dying
kubectl -n diplomes get hpa -w       # CPU % and number of api pods
kubectl -n diplomes get events -w    # everything Kubernetes does
kubectl -n diplomes top pods         # CPU / memory per pod
kubectl -n diplomes describe pod <name>   # why a pod is broken (see Events)
```

## 1. Kill an api pod

```powershell
kubectl -n diplomes delete pod (kubectl -n diplomes get pods -l app=api -o jsonpath='{.items[0].metadata.name}')
```

A new api pod is created right away. The site keeps working.

## 2. Kill a frontend pod

```powershell
kubectl -n diplomes delete pod (kubectl -n diplomes get pods -l app=frontend -o jsonpath='{.items[0].metadata.name}')
```

The site stays online (the 2nd frontend pod answers).

## 3. Kill the database

Issue a diploma on the site first, then:

```powershell
kubectl -n diplomes delete pod -l app=mongo
```

api pods go `0/1` until mongo is back. Verify the diploma again: it is still authentic (data is on the volume).

## 4. Heavy load

Start:

```powershell
kubectl -n diplomes run load --image=busybox:1.36 --restart=Never -- /bin/sh -c "for i in 1 2 3 4 5 6 7 8 9 10; do (while true; do wget -q -O- http://api:4000/api/health >/dev/null; done) & done; wait"
```

In `get hpa -w`: CPU goes above 50%, api pods go from 2 up to 6.

Stop:

```powershell
kubectl -n diplomes delete pod load
```

After about 5 minutes, back to 2 pods.

## 5. Load balancing

```powershell
kubectl -n diplomes port-forward svc/frontend 8080:8080
```

In another window:

```powershell
1..10 | ForEach-Object { curl.exe -s http://localhost:8080/api/health; "" }
```

The `host` field changes: different api pods answer.

## Clean up

```powershell
kubectl -n diplomes delete pod load --ignore-not-found   # stop the load
kubectl delete namespace diplomes                        # delete everything, data included
```
