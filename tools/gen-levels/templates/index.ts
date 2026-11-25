import type { Template } from "../types";
import { bowl } from "./bowl";
import { brick } from "./brick";
import { comb } from "./comb";
import { diamond } from "./diamond";
import { moat } from "./moat";
import { nests } from "./nests";
import { rails } from "./rails";
import { shafts } from "./shafts";
import { slashes } from "./slashes";
import { decker } from "./decker";
import { islands } from "./islands";
import { keep } from "./keep";
import { lattice } from "./lattice";
import { towers } from "./towers";
import { pyramid } from "./pyramid";
import { ring } from "./ring";
import { scatter } from "./scatter";
import { stairs } from "./stairs";
import { tiers } from "./tiers";
import { tunnel } from "./tunnel";
import { waves } from "./waves";
import { hooks } from "./hooks";
import { courtyard } from "./courtyard";
import { spiral } from "./spiral";
import { lanterns } from "./lanterns";
import { bridges } from "./bridges";
import { canyon } from "./canyon";
import { chambers } from "./chambers";
import { zigzag } from "./zigzag";

/** Every template by name. Add new families here. */
export const TEMPLATES: Record<string, Template> = Object.fromEntries(
  [tiers, stairs, zigzag, islands, towers, keep, bowl, decker, lattice, waves, pyramid, brick, comb, scatter, tunnel, ring, shafts, moat, diamond, nests, rails, slashes, hooks, courtyard, spiral, lanterns, bridges, canyon, chambers].map((t) => [t.name, t]),
);
