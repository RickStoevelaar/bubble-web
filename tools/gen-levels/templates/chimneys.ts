import { FLOOR } from "../grid";
import { defineTemplate } from "./util";

/**
 * A heavy low ceiling (`thick` rows at `slab`) that cuts the field in two storeys, pierced by chimneys
 * (`chimneys` = [[col, width], ...]). Step ledges sit under every chimney so players can climb up, and the
 * upper storey carries `upper` ledges ([c0, c1, row]).
 */
export const chimneys = defineTemplate(
  "chimneys",
  "thick low slab pierced by chimneys (col, width) with step ledges under them and ledges on the upper storey",
  { slab: 17, thick: 2, chimneys: [[5, 5], [14, 4], [23, 5]], step: 21, upper: [[2, 9, 12], [22, 29, 12], [11, 20, 7]], gaps: [] },
  (p, g) => {
    g.ledge(2, 29, p.slab, p.thick);
    for (const [c, w] of p.chimneys) {
      g.rect(c!, p.slab, c! + w! - 1, p.slab + p.thick - 1, false);
      g.ledge(c! - 1, c! + w!, p.step);
    }
    for (const [c0, c1, row] of p.upper) if (row! < FLOOR) g.ledge(c0!, c1!, row!);
  },
);
