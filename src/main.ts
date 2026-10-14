import { mountGame } from "./engine.ts";
import "./style.css";

const root = document.querySelector("#app");
if (!root) throw new Error("missing #app");
mountGame(root as HTMLElement);
