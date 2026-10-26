"""Techmap 데모 Master 파일 생성 (합성 데이터, 실제 PDK 아님).
python scripts/gen/make_techmap_demo.py  →  src/apps/techmap/lib/demoMasters.js
2/3nm: M1~M11 / VIA1~VIA10 / AP·PAD,  4nm: ME1~ME9 / VI1~VI8 / RDL·MIM (이름이 다르고 일부 번호가 일부러 다름)
"""
import json, pathlib

COLORS = [('white',255,255,255),('black',0,0,0),('red',255,0,0),('green',0,204,102),('blue',0,0,255),('yellow',255,255,0),
          ('orange',255,128,0),('magenta',255,0,255),('cyan',0,255,255),('brown',153,102,51),('lime',0,255,0),('purple',153,0,204),
          ('gray',128,128,128),('pink',255,153,204),('navy',0,51,153),('teal',0,153,153),('olive',128,128,0),('salmon',250,128,114)]
STIPPLES = {'blank':'(0 0 0 0) (0 0 0 0) (0 0 0 0) (0 0 0 0)','solid':'(1 1 1 1) (1 1 1 1) (1 1 1 1) (1 1 1 1)',
            'dots':'(1 0 0 0) (0 0 0 0) (0 0 1 0) (0 0 0 0)','hLine':'(1 1 1 1) (0 0 0 0) (0 0 0 0) (0 0 0 0)',
            'vLine':'(1 0 0 0) (1 0 0 0) (1 0 0 0) (1 0 0 0)','cross':'(1 0 0 1) (0 1 1 0) (0 1 1 0) (1 0 0 1)',
            'slash':'(1 0 0 0) (0 1 0 0) (0 0 1 0) (0 0 0 1)','backSlash':'(0 0 0 1) (0 0 1 0) (0 1 0 0) (1 0 0 0)'}
METAL_COLORS = ['blue','magenta','cyan','orange','green','purple','teal','salmon','olive','navy','pink']
ABBR = {'drawing':'drw','pin':'pin','fillDummy':'fdm'}
DT = {'drawing':0,'pin':10,'fillDummy':1}

def build(proc, metal, via, nmetal, tops, extras, gds_override):
    layers = [('NW',1,'NW'),('OD',2,'OD'),('PO',3,'PO'),('PP',4,'PP'),('NP',5,'NP'),('CO',10,'CO')]
    lpps = [('NW','drawing'),('OD','drawing'),('PO','drawing'),('PO','pin'),('PP','drawing'),('NP','drawing'),('CO','drawing')]
    for n in range(1, nmetal+1):
        layers.append((f'{metal}{n}', 9+2*n, f'{metal}{n}'))
        lpps += [(f'{metal}{n}','drawing'),(f'{metal}{n}','pin'),(f'{metal}{n}','fillDummy')]
        if n < nmetal:
            layers.append((f'{via}{n}', 10+2*n, f'{via[0]}{n}'))
            lpps.append((f'{via}{n}','drawing'))
    for name,num,purposes in tops + extras:
        layers.append((name,num,name))
        lpps += [(name,p) for p in purposes]
    layers += [('text',230,'text'),('prBoundary',235,'prB'),('DMEXCL',236,'DMX')]
    lpps += [('text','drawing'),('prBoundary','drawing'),('DMEXCL','drawing')]
    num = {l:n for l,n,_ in layers}
    W = lambda s,w: s.ljust(w)
    tf = [f';{"*"*70}', f';  {proc} MASTER technology file  -  synthetic demo (not a real PDK)', f';{"*"*70}', '',
          'layerDefinitions(', '', ' techPurposes(', ' ;( PurposeName          Purpose#   Abbreviation )',
          ' ;( -----------          --------   ------------ )',
          '  ( fillDummy            100        fdm          )', '  ( mark                 101        mrk          )', ' ) ;techPurposes', '',
          ' techLayers(', ' ;( LayerName            Layer#     Abbreviation )', ' ;( ---------            ------     ------------ )']
    tf += [f'  ( {W(l,20)} {W(str(n),10)} {W(a,12)} )' for l,n,a in layers]
    tf += [' ) ;techLayers','',' techLayerPurposePriorities(',' ;layers are ordered from lowest to highest priority',' ;( LayerName            Purpose    )']
    tf += [f'  ( {W(l,20)} {W(p,10)} )' for l,p in lpps]
    tf += [' ) ;techLayerPurposePriorities','',' techDisplays(',' ;( LayerName    Purpose      Packet          Vis Sel Con2ChgLy DrgEnbl Valid )']
    def packet(l,p):
        if p == 'pin' and l != 'PO': return 'metalPin'
        if p == 'fillDummy': return 'metalFill'
        return f'{l}_{ABBR.get(p,p[:3])}'
    for l,p in lpps:
        tf.append(f'  ( {W(l,12)} {W(p,12)} {W(packet(l,p),15)} t t t t t )')
    tf += [' ) ;techDisplays','',') ;layerDefinitions','',
           'layerRules(',' functions(',' ;( layer                function        [maskNumber] )']
    k = 1
    for l,n,_ in layers:
        if l.startswith(metal) or l.startswith(via) or l in ('OD','PO','CO'):
            fn = '"metal"' if l.startswith(metal) else '"cut"' if (l.startswith(via) or l=='CO') else ('"diff"' if l=='OD' else '"poly"')
            tf.append(f'  ( {W(l,20)} {W(fn,15)} {k} )'); k += 1
    tf += [' ) ;functions',') ;layerRules','']
    # layermap
    lm = ['#'+'-'*70, f'# {proc} MASTER stream layer map  -  synthetic demo', '# Cadence Layer   Cadence Purpose   Stream Layer#   Stream Datatype', '#'+'-'*70]
    for l,p in lpps:
        g = gds_override.get((l,p), (num[l] if l!='text' else 63, DT.get(p,0)))
        lm.append(f'{W(l,17)} {W(p,17)} {W(str(g[0]),15)} {g[1]}')
    # drf
    drf = [f';{"*"*70}', f';  {proc} MASTER display resource file  -  synthetic demo', f';{"*"*70}','',
           'drDefineDisplay(',';( DisplayName )',' ( display )',') ;drDefineDisplay','',
           'drDefineColor(',';( DisplayName   ColorName     Red   Green  Blue )']
    drf += [f' ( display       {W(c,13)} {W(str(r),5)} {W(str(g),6)} {W(str(b),4)} )' for c,r,g,b in COLORS]
    drf += [') ;drDefineColor','','drDefineStipple(',';( DisplayName   StippleName   Bitmap )']
    drf += [f' ( display       {W(s,13)} ( {bm} ) )' for s,bm in STIPPLES.items()]
    drf += [') ;drDefineStipple','','drDefineLineStyle(',';( DisplayName   LineStyle     Size   Pattern )',
            ' ( display       solid         1      (1 1 1) )',' ( display       dashed        1      (1 1 1 1 0 0) )',
            ' ( display       thickLine     3      (1 1 1) )',') ;drDefineLineStyle','',
            'drDefinePacket(',';( DisplayName   PacketName    Stipple     LineStyle   Fill       Outline    [FillStyle] )']
    seen = set()
    feol = {'NW':('blank','dashed','lime','outline'),'OD':('dots','solid','green','outlineStipple'),'PO':('slash','solid','red','outlineStipple'),
            'PP':('blank','dashed','orange','outline'),'NP':('blank','dashed','cyan','outline'),'CO':('solid','solid','white','solid')}
    for l,p in lpps:
        pk = packet(l,p)
        if pk in seen: continue
        seen.add(pk)
        if pk == 'metalPin': s,ls,c,fs = 'cross','thickLine','yellow','outlineStipple'
        elif pk == 'metalFill': s,ls,c,fs = 'dots','dashed','gray','outline'
        elif l in feol: s,ls,c,fs = feol[l]; s = 'cross' if p=='pin' else s
        elif l.startswith(metal): s,ls,c,fs = ('backSlash' if int(l[len(metal):])%2 else 'slash'),'solid',METAL_COLORS[(int(l[len(metal):])-1)%len(METAL_COLORS)],'outlineStipple'
        elif l.startswith(via): s,ls,c,fs = 'cross','solid',METAL_COLORS[(int(l[len(via):]))%len(METAL_COLORS)],'outlineStipple'
        elif l in ('text','prBoundary'): s,ls,c,fs = 'blank','solid','white' if l=='text' else 'purple','outline'
        elif l == 'DMEXCL': s,ls,c,fs = 'hLine','dashed','brown','outline'
        else: s,ls,c,fs = 'vLine','solid','pink','outlineStipple'
        drf.append(f' ( display       {W(pk,13)} {W(s,11)} {W(ls,11)} {W(c,10)} {W(c,10)} {fs} )')
    drf += [') ;drDefinePacket','']
    j = lambda xs: '\n'.join(xs) + '\n'
    return {'tf': {'name': f'{proc}_master.tf', 'text': j(tf)}, 'layermap': {'name': f'{proc}_master.layermap', 'text': j(lm)},
            'drf': {'name': f'{proc}_display.drf', 'text': j(drf)}}

# 노드(Process) Master: 2/3nm(폴더 id 2_3nm) · 4nm — 4nm는 이름 규칙이 다르고(ME · VI · RDL) VI4 번호가 일부러 다름
N23 = build('2_3nm', 'M', 'VIA', 11, [('AP',60,['drawing','pin']),('PAD',61,['drawing'])], [], {})
N4 = build('4nm', 'ME', 'VI', 9, [('RDL',60,['drawing','pin'])], [('MIM',70,['drawing'])], {('VI4','drawing'):(19,5)})
out = pathlib.Path(__file__).resolve().parents[2] / 'src/apps/techmap/lib/demoMasters.js'
out.write_text('// 데모 Master (scripts/gen/make_techmap_demo.py로 생성 — 합성 데이터, 실제 PDK 아님)\n'
               f'export const DEMO_MASTERS = {json.dumps({"2_3nm": N23, "4nm": N4}, ensure_ascii=False, indent=1)};\n', encoding='utf-8')
print('written', out, sum(len(f['text']) for m in (N23,N4) for f in m.values()))
