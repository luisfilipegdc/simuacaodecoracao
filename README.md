# ❤ Coração 3D — Batimento e Ataque Cardíaco

Simulação 3D realista do coração humano para feira de ciências.

- **Batimento normal**: sístole atrial, sístole ventricular (com torção) e diástole; impulso elétrico percorrendo o coração; sangue fluindo nas coronárias; ECG, oximetria e sons "tum-tá".
- **Ataque cardíaco** (passo a passo): placa de gordura → coágulo na artéria DA → isquemia (supra de ST) → necrose (onda Q) → fibrilação ventricular → desfibrilação → angioplastia com stent.
- Funciona no iPad (toque, pinça para zoom, tela cheia) e **offline** depois da primeira abertura.

## Publicar na Vercel
1. Importe este repositório na Vercel.
2. Framework: **Other** — sem comando de build, diretório raiz `/`.
3. Deploy. Pronto.

## Dicas para o iPad na feira
- Abra o site no Safari, toque em **Compartilhar → Adicionar à Tela de Início**: ele abre em tela cheia, como um app.
- Abra o site uma vez com internet: depois ele funciona sem Wi-Fi.
- Toque em 🔊 para ligar o som (o iPad exige um toque para liberar o áudio) e desligue o modo silencioso.
- Use **⏯ Automático** no modo "Ataque cardíaco" para a apresentação rodar sozinha.

## Rodar no computador
```
python3 -m http.server 8000
```
e abra http://localhost:8000
