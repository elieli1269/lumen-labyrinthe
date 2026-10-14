# Lumen

Labyrinthe 3D low poly, vue à la première personne.

Marche dans un jardin de papier, ramasse les prismes et trouve la sortie. La mini-carte ne révèle que les couloirs déjà explorés. Le chronomètre s’arrête sur l’écran de victoire.

## Contrôles

| Action | Clavier | Téléphone |
| --- | --- | --- |
| Marcher | ZQSD, WASD ou flèches | Joystick à gauche |
| Regarder | Souris | Glisser à droite |
| Courir | Maj | Joystick à fond |
| Pause | Échap ou Pause | Pause |

## Build

GitHub Actions lance les tests de collisions et `npm run build` à chaque push sur `main`.

```bash
npm ci
npm test
npm run build
npm run dev
```
