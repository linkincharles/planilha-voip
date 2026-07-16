#!/usr/bin/env python3
"""
Converte backup do VoipFlow antigo (v2.0, modelo 1 empresa = N telefones
em 'numero_telefones') para o novo modelo (v2.3, 1 telefone = 1 registro
em 'numeros.telefone').

Uso:
  python3 convert_backup_v2.0_to_v2.3.py <entrada.json.gz> <saida.json.gz>

O arquivo de saida pode ser restaurado via POST /api/restore (admin).
O restore preserva o usuario admin atual e ignora a tabela 'telefones'
(inexistente no novo schema).
"""
import gzip
import json
import sys


def converter(src_path, out_path):
    with gzip.open(src_path, 'rt') as f:
        b = json.load(f)
    d = b['dados']
    pais = {n['id']: n for n in d['numeros']}

    novos_numeros = []
    seen = set()
    for t in d['telefones']:
        p = pais.get(t['numero_id'])
        if not p:
            continue
        tel = str(t['telefone']).strip()
        if not tel or tel in seen:
            continue
        seen.add(tel)
        novos_numeros.append({
            'empresa': p.get('empresa'),
            'telefone': tel,
            'operadora': p.get('operadora'),
            'servidor': p.get('servidor'),
            'status': p.get('status') or 'Ativo',
            'contrato': p.get('contrato'),
            'obs': p.get('obs'),
            'data_ativacao': p.get('data_ativacao'),
            'criado_em': p.get('criado_em'),
            # atualizado_em omitido: MySQL preenche default
        })

    novo_backup = {
        'versao': '2.3',
        'gerado_em': b.get('gerado_em'),
        'sistema': 'VoipFlow',
        'dados': {
            'numeros': novos_numeros,
            'operadoras': d.get('operadoras'),
            'config': d.get('config'),
            'portabilidade': d.get('portabilidade'),
            'portabilidade_docs': d.get('portabilidade_docs'),
            'historico': d.get('historico'),
        }
    }
    with gzip.open(out_path, 'wt') as f:
        json.dump(novo_backup, f, ensure_ascii=False)

    print(f'telefones originais: {len(d["telefones"])}')
    print(f'numeros convertidos (1 por telefone): {len(novos_numeros)}')
    print(f'empresas unicas: {len(set(n["empresa"] for n in novos_numeros))}')
    print(f'salvo em: {out_path}')


if __name__ == '__main__':
    if len(sys.argv) != 3:
        print('Uso: python3 convert_backup_v2.0_to_v2.3.py <entrada.json.gz> <saida.json.gz>')
        sys.exit(1)
    converter(sys.argv[1], sys.argv[2])
