#!/usr/bin/env python3
"""
Scraper do Diário Oficial do Município de Natal (DOM).
Extrai Licença Prévia (LP), Licença de Instalação (LI) e Licença de Operação (LO).

Roda via GitHub Actions. Escreve direto em public.dom_licencas via Supabase REST
usando SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY do ambiente.

Uso:
    python scripts/dom_natal_scraper.py
    python scripts/dom_natal_scraper.py --mes 5 --ano 2026 --meses-atras 2
"""

import os
import re
import sys
import time
import argparse
import tempfile
from datetime import date
from pathlib import Path

import requests
import pdfplumber
from supabase import create_client, Client

# ── Configuração ─────────────────────────────────────────────────────────────

BASE_URL = "https://www.natal.rn.gov.br"
SLEEP_ENTRE_DOWNLOADS = 1.5  # segundos — respeito ao servidor público

PADRAO_LP = re.compile(r"Licen[çc]a\s+Pr[ée]via(\s*[-–]?\s*LP)?", re.IGNORECASE)
PADRAO_LI = re.compile(r"Licen[çc]a\s+de\s+Instala[çc][ãa]o(\s*[-–]?\s*LI)?", re.IGNORECASE)
PADRAO_LO = re.compile(r"Licen[çc]a\s+(Ambiental\s+)?de\s+Opera[çc][ãa]o(\s*[-–]?\s*LO)?", re.IGNORECASE)
PADRAO_PROCESSO = re.compile(
    r"Processo\s*n?[ºo°]?\.?\s*[:\-]?\s*([A-Z]{2,10}[-\.]?\d{6,20})", re.IGNORECASE
)


# ── Descoberta de edições ─────────────────────────────────────────────────────

def listar_edicoes(mes: int, ano: int, session: requests.Session) -> list[dict]:
    """
    Chama GET /api/dom/data/{mes}/{ano} e retorna lista de edições do mês.

    Resposta da API (descoberta via DevTools):
        {"data": [["<a href='URL.pdf' target='_blank'>Ano XXVI - Num. 6097 - 01/06/2026</a>"], ...]}
    """
    mes_pad = str(mes).zfill(2)
    url = f"{BASE_URL}/api/dom/data/{mes_pad}/{ano}"
    resp = session.get(
        url,
        headers={
            "Accept": "application/json, text/javascript, */*; q=0.01",
            "X-Requested-With": "XMLHttpRequest",
            "Referer": f"{BASE_URL}/dom",
        },
        timeout=30,
    )
    resp.raise_for_status()

    payload = resp.json()
    re_anchor = re.compile(r"href=['\"]([^'\"]+\.pdf)['\"][^>]*>\s*([^<]*)</a>", re.IGNORECASE)
    re_data   = re.compile(r"(\d{2})/(\d{2})/(\d{4})")
    re_num    = re.compile(r"Num\.?\s*(\d+)", re.IGNORECASE)
    re_tipo   = re.compile(r"-\s*(Extra|Especial)\s*-", re.IGNORECASE)

    edicoes = []
    for row in payload.get("data") or []:
        html = row[0] if row else ""
        m = re_anchor.search(html)
        if not m:
            continue
        pdf_url, texto = m.group(1), m.group(2).strip()
        dm = re_data.search(texto)
        data_iso = f"{dm.group(3)}-{dm.group(2)}-{dm.group(1)}" if dm else None
        tipo_m = re_tipo.search(texto)
        num_m = re_num.search(texto)
        edicoes.append({
            "url": pdf_url,
            "data": data_iso,
            "numero_edicao": num_m.group(1) if num_m else None,
            "tipo": tipo_m.group(1).capitalize() if tipo_m else "Padrão",
        })
    return edicoes


# ── Extração de texto ─────────────────────────────────────────────────────────

def extrair_texto(pdf_path: Path) -> str:
    with pdfplumber.open(pdf_path) as pdf:
        return "\n".join((p.extract_text() or "") for p in pdf.pages)


# ── Extração de licenças ──────────────────────────────────────────────────────

def extrair_licencas(texto: str, edicao: dict) -> list[dict]:
    """
    Divide o texto em blocos (parágrafos duplos) e retorna um registro
    por bloco que mencione LP, LI ou LO.
    """
    blocos = re.split(r"\n\s*\n", texto)
    achados = []
    for bloco in blocos:
        limpo = bloco.strip()
        if not limpo:
            continue
        tipos = []
        if PADRAO_LP.search(limpo):
            tipos.append("LP")
        if PADRAO_LI.search(limpo):
            tipos.append("LI")
        if PADRAO_LO.search(limpo):
            tipos.append("LO")
        if not tipos:
            continue
        proc_m = PADRAO_PROCESSO.search(limpo)
        achados.append({
            "data_edicao":    edicao["data"],
            "numero_edicao":  edicao["numero_edicao"],
            "tipo_edicao":    edicao["tipo"],
            "url_pdf":        edicao["url"],
            "tipos_licenca":  tipos,
            "processo":       proc_m.group(1) if proc_m else None,
            "texto_bloco":    limpo[:2000],
        })
    return achados


# ── Processamento de um mês ───────────────────────────────────────────────────

def processar_mes(mes: int, ano: int, supabase: Client, session: requests.Session) -> tuple[int, int]:
    print(f"[i] {mes:02d}/{ano} — listando edições")
    edicoes = listar_edicoes(mes, ano, session)
    print(f"    {len(edicoes)} edições encontradas")
    if not edicoes:
        return 0, 0

    # Filtra edições já presentes na tabela
    urls = [e["url"] for e in edicoes]
    res = supabase.table("dom_licencas").select("url_pdf").in_("url_pdf", urls).execute()
    ja_presentes = {r["url_pdf"] for r in (res.data or [])}
    novas = [e for e in edicoes if e["url"] not in ja_presentes]
    print(f"    {len(novas)} edições novas para processar")

    total_inseridos = 0
    for edicao in novas:
        nome = edicao["url"].split("/")[-1]
        print(f"  → {nome}")

        try:
            pdf_resp = session.get(edicao["url"], timeout=60)
            pdf_resp.raise_for_status()
        except Exception as exc:
            print(f"    [erro download] {exc}")
            time.sleep(SLEEP_ENTRE_DOWNLOADS)
            continue

        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
            tmp.write(pdf_resp.content)
            tmp_path = Path(tmp.name)

        try:
            texto = extrair_texto(tmp_path)
        except Exception as exc:
            print(f"    [erro pdfplumber] {exc}")
            tmp_path.unlink(missing_ok=True)
            time.sleep(SLEEP_ENTRE_DOWNLOADS)
            continue
        finally:
            tmp_path.unlink(missing_ok=True)

        achados = extrair_licencas(texto, edicao)

        # Sem licenças: insere placeholder para não reprocessar
        if not achados:
            achados = [{
                "data_edicao":   edicao["data"],
                "numero_edicao": edicao["numero_edicao"],
                "tipo_edicao":   edicao["tipo"],
                "url_pdf":       edicao["url"],
                "tipos_licenca": [],
                "processo":      None,
                "texto_bloco":   "(Nenhuma LP/LI/LO identificada nesta edição)",
            }]

        for achado in achados:
            try:
                supabase.table("dom_licencas").upsert(
                    achado, on_conflict="url_pdf,texto_bloco"
                ).execute()
                total_inseridos += 1
            except Exception as exc:
                print(f"    [erro insert] {exc}")

        print(f"    {len(achados)} registro(s) inserido(s)")
        time.sleep(SLEEP_ENTRE_DOWNLOADS)

    return len(novas), total_inseridos


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="Scraper do DOM Natal → dom_licencas")
    parser.add_argument("--mes",         type=int, default=date.today().month,
                        help="Mês base (padrão: mês atual)")
    parser.add_argument("--ano",         type=int, default=date.today().year,
                        help="Ano base (padrão: ano atual)")
    parser.add_argument("--meses-atras", type=int, default=1,
                        help="Quantos meses anteriores também processar (padrão: 1)")
    args = parser.parse_args()

    supabase_url = os.environ.get("SUPABASE_URL")
    service_key  = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not supabase_url or not service_key:
        print("[erro] SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios", file=sys.stderr)
        sys.exit(1)

    client  = create_client(supabase_url, service_key)
    session = requests.Session()
    session.headers.update({"User-Agent": "DOMNatalBot/1.0 (github.com/mdrepresentacoes)"})

    # Constrói lista de (mes, ano) do mais antigo para o mais recente
    base_mes, base_ano = args.mes, args.ano
    meses: list[tuple[int, int]] = []
    for i in range(args.meses_atras, -1, -1):
        m = base_mes - i
        a = base_ano
        while m <= 0:
            m += 12
            a -= 1
        meses.append((m, a))

    total_novas = total_inseridos = 0
    for mes, ano in meses:
        novas, inseridos = processar_mes(mes, ano, client, session)
        total_novas     += novas
        total_inseridos += inseridos

    print(f"\n[✓] Concluído — {total_novas} edições novas, {total_inseridos} registros inseridos")


if __name__ == "__main__":
    main()
