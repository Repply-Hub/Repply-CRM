"""
Gera os sons de notificação criados pela Repply e nivela o volume de TODAS as
opções pelo som padrão (≈ −15 LUFS), para que trocar de som não mude o volume.

Uso (na raiz do repositório):
  python scripts/gerar-sons-de-notificacao.py "<pasta com os 5 arquivos originais>"

A pasta de origem é qualquer uma que contenha os 5 arquivos com os nomes listados em
DO_LUCAS (logo abaixo) — hoje isso é o backup em ../_sons-originais, fora do
repositório, já que a pasta antiga dentro do repositório foi removida depois da
primeira geração.

Saída: public/sons/opcoes/*.mp3 — mono, 44,1 kHz, 128 kbps, dentro de ±1 LU de
ALVO_LUFS. Cada arquivo é medido DEPOIS de gravado (nunca só calculado a partir da
origem) e corrigido de novo, até 3 vezes, se o limitador (`alimiter`) tiver deixado
o volume real longe do pedido. Se mesmo assim continuar fora da faixa, o script para
com um erro nomeando o arquivo — nunca escreve um arquivo fora da faixa em silêncio.

Os 4 sons "da Repply" são sintetizados aqui, por soma de senoides: não há
arquivo de terceiro, então não há direito autoral a verificar. Os outros 5 são
os arquivos que o dono do produto escolheu (Pixabay), só renomeados e nivelados.
"""
import os
import re
import shutil
import subprocess
import sys
import tempfile

import numpy as np

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DESTINO = os.path.join(RAIZ, "public", "sons", "opcoes")
ALVO_LUFS = -15.0
TOLERANCIA_OK = 0.5  # abaixo disso, para de corrigir
TOLERANCIA_MAXIMA = 1.0  # acima disso, mesmo depois das correções, é erro
MAX_PASSADAS_CORRECAO = 3
SR = 44100

DO_LUCAS = {
    "dragon-studio-new-notification-3-398649.mp3": "toque-suave.mp3",
    "dragon-studio-notification-sound-effect-372475.mp3": "plim.mp3",
    "universfield-new-notification-051-494246.mp3": "cristal.mp3",
    "universfield-new-notification-059-494262.mp3": "arpejo.mp3",
    "universfield-new-notification-062-494544.mp3": "pop.mp3",
}


def nota(freq, dur, parciais, queda, ataque=0.004):
    """Uma nota: soma de parciais (razão, amplitude, fator de queda), com ataque curto."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    s = np.zeros(n)
    for razao, amp, fator in parciais:
        s += amp * np.sin(2 * np.pi * freq * razao * t) * np.exp(-t / (queda * fator))
    return s * np.minimum(1.0, t / ataque)


def colar(partes, inicios, total):
    """Posiciona cada sinal no seu instante, numa faixa de `total` segundos."""
    out = np.zeros(int(total * SR))
    for sinal, ini in zip(partes, inicios):
        i = int(ini * SR)
        fim = min(len(out), i + len(sinal))
        out[i:fim] += sinal[: fim - i]
    return out


def marimba():
    p = [(1.0, 1.0, 1.0), (3.9, 0.35, 0.35), (9.2, 0.08, 0.15)]
    return colar([nota(784, 0.5, p, 0.14), nota(659, 0.6, p, 0.16)], [0.0, 0.13], 0.8)


def sino():
    p = [(0.56, 0.5, 1.6), (0.92, 0.6, 1.2), (1.19, 0.9, 1.0), (1.71, 0.4, 0.7),
         (2.0, 0.35, 0.6), (2.74, 0.25, 0.4), (3.0, 0.2, 0.35), (4.07, 0.1, 0.25)]
    return nota(1320, 1.8, p, 0.6, ataque=0.002)


def gota():
    n = int(0.35 * SR)
    t = np.arange(n) / SR
    f = 500 + 900 * np.exp(-t / 0.05)  # desce de ~1400 Hz para ~500 Hz
    fase = 2 * np.pi * np.cumsum(f) / SR
    envelope = np.minimum(1.0, t / 0.003) * np.exp(-t / 0.09)
    return colar([np.sin(fase) * envelope], [0.0], 0.6)


def bipe_duplo():
    def bipe():
        dur = 0.09
        n = int(dur * SR)
        t = np.arange(n) / SR
        s = np.sin(2 * np.pi * 1046 * t) + 0.15 * np.sin(2 * np.pi * 2092 * t)
        borda = np.clip(np.minimum(t / 0.01, (dur - t) / 0.01), 0.0, 1.0)
        return s * borda
    return colar([bipe(), bipe()], [0.0, 0.16], 0.6)


GERADOS = {"marimba.mp3": marimba, "sino.mp3": sino, "gota.mp3": gota, "bipe-duplo.mp3": bipe_duplo}


def lufs(caminho):
    r = subprocess.run(
        ["ffmpeg", "-hide_banner", "-nostats", "-i", caminho, "-af", "ebur128", "-f", "null", "-"],
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    achados = re.findall(r"I:\s+(-?[\d.]+) LUFS", r.stderr)
    if not achados:
        raise RuntimeError(f"não consegui medir o volume de {caminho}")
    return float(achados[-1])


def gerar_wav(sinal, caminho):
    sinal = (sinal / np.max(np.abs(sinal)) * 0.8).astype(np.float32)
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(SR), "-ac", "1", "-i", "-", caminho],
        input=sinal.tobytes(), check=True,
    )


def gravar_mp3(origem, destino, ganho_db):
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-i", origem,
         "-af", f"volume={ganho_db:.2f}dB,alimiter=limit=0.95",
         "-ac", "1", "-ar", str(SR), "-codec:a", "libmp3lame", "-b:a", "128k", destino],
        check=True,
    )


def gravar_e_corrigir(origem, destino):
    """Grava o mp3 final e confere o volume que REALMENTE saiu.

    A primeira gravação usa o ganho calculado a partir da loudness da ORIGEM.
    Só que o limitador (`alimiter`) entra para cortar pico e pode entregar um
    volume menor do que o pedido — foi assim que `toque-suave.mp3` saiu a
    −18,8 LUFS numa passada só. Por isso aqui a saída é sempre MEDIDA de novo
    depois de escrita, nunca só calculada, e corrigida a partir de si mesma
    (grava num arquivo temporário NA MESMA PASTA do destino — para o
    `os.replace` trocar os dois sem depender de mover entre unidades de disco
    — e só então substitui o destino) até chegar perto do alvo ou esgotar as
    passadas.
    """
    gravar_mp3(origem, destino, ALVO_LUFS - lufs(origem))
    atual = lufs(destino)
    passadas = 0
    while abs(atual - ALVO_LUFS) > TOLERANCIA_OK and passadas < MAX_PASSADAS_CORRECAO:
        temporario = os.path.join(
            os.path.dirname(destino), f".correcao-{passadas}-{os.path.basename(destino)}"
        )
        gravar_mp3(destino, temporario, ALVO_LUFS - atual)
        os.replace(temporario, destino)
        atual = lufs(destino)
        passadas += 1
    if abs(atual - ALVO_LUFS) > TOLERANCIA_MAXIMA:
        sys.exit(
            f"{os.path.basename(destino)} ficou em {atual:.1f} LUFS depois de "
            f"{passadas} correção(ões) — fora da faixa aceita "
            f"({ALVO_LUFS - TOLERANCIA_MAXIMA:.1f} a {ALVO_LUFS + TOLERANCIA_MAXIMA:.1f} LUFS). "
            "Confira o arquivo de origem antes de gerar de novo."
        )
    return atual


def main():
    if shutil.which("ffmpeg") is None:
        sys.exit(
            "ffmpeg não foi encontrado no PATH. Instale o ffmpeg (inclui o ffprobe) e "
            "tente de novo — este script depende dele para medir e gravar os sons."
        )
    if len(sys.argv) != 2:
        sys.exit('uso: python scripts/gerar-sons-de-notificacao.py "<pasta com os arquivos do Lucas>"')
    origem = sys.argv[1]
    os.makedirs(DESTINO, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        fontes = {}
        for antigo, novo in DO_LUCAS.items():
            caminho = os.path.join(origem, antigo)
            if not os.path.exists(caminho):
                sys.exit(f"faltou {caminho}")
            fontes[novo] = caminho
        for novo, fabrica in GERADOS.items():
            wav = os.path.join(tmp, novo.replace(".mp3", ".wav"))
            gerar_wav(fabrica(), wav)
            fontes[novo] = wav
        for novo, caminho in fontes.items():
            destino = os.path.join(DESTINO, novo)
            final = gravar_e_corrigir(caminho, destino)
            print(f"{novo:18s} {final:6.1f} LUFS")


if __name__ == "__main__":
    main()
