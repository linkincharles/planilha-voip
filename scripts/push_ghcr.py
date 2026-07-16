#!/usr/bin/env python3
"""Push Docker images to GHCR via OCI API (workaround para DPI que bloqueia docker push)."""
import json, os, requests, subprocess, sys, hashlib, time, glob

GHCR = 'https://ghcr.io'
USER = 'linkincharles'
TOKEN = open(os.path.expanduser('~/.ghcr_token')).read().strip()
HEADERS = {'Authorization': f'Bearer {TOKEN}'}

def docker_cmd(args):
    return subprocess.run(['sudo', 'docker'] + args, capture_output=True, text=True, check=True)

def push_image(image_tag):
    """Push a local Docker image to GHCR."""
    print(f'\n=== Push: {image_tag} ===')
    
    r = docker_cmd(['image', 'inspect', image_tag])
    img = json.loads(r.stdout)[0]
    
    repo_short = image_tag.split('/')[-1]
    repo = f'{USER}/{repo_short}'
    tag = image_tag.split(':')[-1]
    
    # Save and extract
    docker_cmd(['save', image_tag, '-o', '/tmp/_img.tar'])
    subprocess.run(['sudo', 'mkdir', '-p', '/tmp/_img'])
    subprocess.run(['sudo', 'tar', '-xf', '/tmp/_img.tar', '-C', '/tmp/_img'])
    subprocess.run(['sudo', 'chmod', '-R', 'a+r', '/tmp/_img'])
    
    with open('/tmp/_img/manifest.json') as f:
        mdata = json.load(f)
    
    cfg_file = mdata[0]['Config']
    layers_names = mdata[0]['Layers']
    
    with open(f'/tmp/_img/{cfg_file}') as f:
        config = json.load(f)
    
    with open(f'/tmp/_img/{cfg_file}', 'rb') as f:
        cfg_data = f.read()
    cfg_size = len(cfg_data)
    config_dgst = hashlib.sha256(cfg_data).hexdigest()
    
    print(f'Config: {cfg_file}  Digest: {config_dgst[:16]}...')
    print(f'Layers: {len(layers_names)}')
    
    # Upload layers
    for i, layer_file in enumerate(layers_names):
        layer_path = f'/tmp/_img/{layer_file}'
        if not os.path.exists(layer_path):
            print(f'  Layer {i+1}: NOT FOUND {layer_file}')
            continue
        
        with open(layer_path, 'rb') as f:
            layer_data = f.read()
        
        layer_dgst = hashlib.sha256(layer_data).hexdigest()
        print(f'  Layer {i+1}/{len(layers_names)}: {os.path.basename(layer_file)} ({len(layer_data)/1024:.0f} KB)')
        
        check = requests.head(f'{GHCR}/v2/{repo}/blobs/sha256:{layer_dgst}', headers=HEADERS)
        if check.status_code == 200:
            print(f'    Already exists')
            continue
        
        upload = requests.post(f'{GHCR}/v2/{repo}/blobs/uploads/', headers=HEADERS)
        if upload.status_code not in (201, 202):
            print(f'    Upload init failed: {upload.status_code} {upload.text[:200]}')
            continue
        
        loc = upload.headers['Location']
        if not loc.startswith('http'):
            loc = f'{GHCR}{loc}'
        
        put = requests.put(f'{loc}&digest=sha256:{layer_dgst}', data=layer_data,
                          headers={**HEADERS, 'Content-Type':'application/octet-stream'})
        print(f'    Upload: {put.status_code}')
        if put.status_code not in (201, 202):
            print(f'    Failed: {put.text[:200]}')
        time.sleep(0.3)
    
    # Upload config blob
    check = requests.head(f'{GHCR}/v2/{repo}/blobs/sha256:{config_dgst}', headers=HEADERS)
    if check.status_code != 200:
        upload = requests.post(f'{GHCR}/v2/{repo}/blobs/uploads/', headers=HEADERS)
        if upload.status_code in (201, 202):
            loc = upload.headers['Location']
            if not loc.startswith('http'): loc = f'{GHCR}{loc}'
            put = requests.put(f'{loc}&digest=sha256:{config_dgst}', data=cfg_data,
                              headers={**HEADERS, 'Content-Type':'application/octet-stream'})
            print(f'  Config upload: {put.status_code}')
        else:
            print(f'  Config init failed: {upload.status_code}')
    else:
        print(f'  Config exists')
    
    # Build and push manifest
    manifest = {
        'schemaVersion': 2,
        'mediaType': 'application/vnd.docker.distribution.manifest.v2+json',
        'config': {
            'mediaType': 'application/vnd.docker.container.image.v1+json',
            'size': cfg_size,
            'digest': f'sha256:{config_dgst}'
        },
        'layers': []
    }
    for layer_file in layers_names:
        layer_path = f'/tmp/_img/{layer_file}'
        with open(layer_path, 'rb') as f:
            ldata = f.read()
        ldgst = hashlib.sha256(ldata).hexdigest()
        mtype = 'application/vnd.docker.image.rootfs.diff.tar.gzip' if layer_file.endswith(('.tar.gz','.tgz')) else 'application/vnd.docker.image.rootfs.diff.tar'
        manifest['layers'].append({
            'mediaType': mtype,
            'size': len(ldata),
            'digest': f'sha256:{ldgst}'
        })
    
    man_bytes = json.dumps(manifest).encode()
    put_man = requests.put(
        f'{GHCR}/v2/{repo}/manifests/{tag}',
        data=man_bytes,
        headers={**HEADERS, 'Content-Type': 'application/vnd.docker.distribution.manifest.v2+json'}
    )
    if put_man.status_code in (201, 200):
        print(f'  Manifest: {put_man.status_code}')
        print(f'  ✅ ghcr.io/{repo}:{tag}')
    else:
        print(f'  ❌ Manifest failed: {put_man.status_code} {put_man.text[:300]}')
    
    subprocess.run(['sudo', 'rm', '-rf', '/tmp/_img', '/tmp/_img.tar'])

if __name__ == '__main__':
    images = sys.argv[1:] if len(sys.argv) > 1 else [
        'ghcr.io/linkincharles/planilha-voip-backend:1.0',
        'ghcr.io/linkincharles/planilha-voip-frontend:1.0'
    ]
    for img in images:
        try:
            push_image(img)
        except Exception as e:
            print(f'ERRO em {img}: {e}')
            import traceback
            traceback.print_exc()
