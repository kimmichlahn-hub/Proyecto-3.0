# TIPSTER PRO v16

## Novedades v16

### 1. Filtro Fecha FIFA
- En ventanas FIFA oficiales, solo aparecen selecciones nacionales
- Los partidos de clubes se ocultan automáticamente
- Banner informativo al activarse

### 2. Sidebar Colapsible
- Botón toggle para colapsar/expandir el sidebar
- Menú completo de ligas con contador de eventos:
  - 🇨🇴 Colombia: Liga BetPlay, Torneo, Femenina, Copa BetPlay
  - 🌎 CONMEBOL: Libertadores, Sudamericana, Brasileirao, Argentina
  - 🌍 Selecciones: Copa Mundo 2026, Amistosos
  - 🏴 Europa: Champions, Europa League, Premier, La Liga, LaLiga2, Bundesliga, Serie A, Ligue 1...
  - 🏀 Baloncesto: NBA, ACB, LEB Oro, BBL, Pro A, Elite, LBF, BNXT, Femeninas
  - 🎮 Esports: Batalla eSports, Cyber Live Arena, Esports Battle
  - 🏎️ F1, 🥊 UFC/MMA

### 3. Mercados de Jugadores (Props)
- Fútbol: Tiros a puerta, Goleador, Tarjetas, Asistencias, Paradas del portero
- NBA: PTS, REB, AST columnas separadas

### 4. Panel de Arbitraje (Surebets)
- Sección dedicada en sidebar → Arbitraje
- Detección automática de diferencias entre casas
- Modo DEMO cuando el servidor no está conectado

### 5. Was AI Right — Jerarquía completa
- Agrupado por deporte → liga
- ROI por liga mostrado
- Compatible con todas las nuevas ligas

### 6. Resolución 100% corregida
- Viewport `device-width` (no fijo 1400px)
- Tamaños de fuente ajustados para zoom normal

### 7. Picks IA — Botón APOSTAR directo
- El botón APOSTAR está en cada pick sin pasos intermedios

## Uso
1. Descomprime el ZIP
2. Doble clic en INICIAR.bat (Windows)
3. Abre http://localhost:3001

## API Keys
Edita `server.js`:
```js
const ODDS_API_KEYS = ['TU_KEY_1', 'TU_KEY_2'];
```
Obtén una key gratis en https://the-odds-api.com
