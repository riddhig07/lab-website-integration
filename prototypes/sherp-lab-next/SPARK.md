# Run lab-site on Spark (`spark-0c14`)

The project lives on your Mac at `~/Desktop/parallex/lab-site`. Spark does not have a `~/Desktop/parallex` path unless you copy or clone it there.

## 1. Copy from Mac to Spark (fastest if not on GitHub yet)

**On your Mac** (new terminal):

```bash
scp -r ~/Desktop/parallex/lab-site sgaddamwar@spark-0c14:~/lab-site
```

**On Spark:**

```bash
cd ~/lab-site
```

## 2. Or clone from GitHub (after `lab-site` is pushed from Mac)

```bash
git clone https://github.com/rgaddamw/parallax.git ~/parallax
cd ~/parallax/lab-site
```

## 3. Node.js on Spark

Need **Node 20+**:

```bash
node -v
```

If missing, use [nvm](https://github.com/nvm-sh/nvm) or your cluster’s module, e.g.:

```bash
module load node   # if your Spark image provides this
```

## 4. Install and run

```bash
cd ~/lab-site   # or ~/parallax/lab-site
npm install
npm run build
npm run start
```

Dev mode (hot reload):

```bash
npm run dev
```

Server listens on **0.0.0.0:3001** so you can tunnel from your laptop.

## 5. Open in browser from your Mac

SSH port forward (run on **Mac**, keep session open):

```bash
ssh -L 3001:localhost:3001 sgaddamwar@spark-0c14
```

Then on Mac: **http://localhost:3001**

## 6. Optional env

```bash
cp .env.example .env.local
# edit INTRANET_PASSWORD, Drive, GitHub vars if needed
```
