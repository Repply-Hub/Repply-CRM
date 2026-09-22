import { describe, it, expect } from "vitest";
import { idsAbertasPorPadrao } from "./mensagens-abertas-por-padrao";

const M = (id: string, tipo: "sent" | "received", lido?: boolean) => ({ id, tipo, lido });

describe("idsAbertasPorPadrao", () => {
  it("abre a mensagem que foi aberta e as recebidas não lidas", () => {
    const r = idsAbertasPorPadrao(
      [M("a", "received", true), M("b", "received", false), M("c", "sent"), M("d", "received", false)],
      "a",
    );
    expect([...r].sort()).toEqual(["a", "b", "d"]);
  });

  it("sem idAberto, ainda abre as não lidas", () => {
    expect([...idsAbertasPorPadrao([M("a", "received", false), M("b", "received", true)], null)]).toEqual(["a"]);
  });

  it("mensagem enviada nunca conta como 'não lida'", () => {
    expect([...idsAbertasPorPadrao([M("c", "sent")], null)]).toEqual([]);
  });

  it("idAberto que não está na lista é ignorado sem quebrar", () => {
    expect([...idsAbertasPorPadrao([M("a", "received", true)], "zzz")]).toEqual([]);
  });

  it("não duplica quando a mensagem aberta também é não lida", () => {
    const r = idsAbertasPorPadrao([M("a", "received", false)], "a");
    expect([...r]).toEqual(["a"]);
  });
});
