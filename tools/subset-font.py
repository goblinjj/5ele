#!/usr/bin/env python3
"""
重新生成游戏内字体子集（packages/client/public/fonts/NotoSerifSC-700-subset.woff2）。

游戏只内嵌源码里实际出现的汉字（约 1200 个，~200KB）。新增了文案里的生僻字后，
如果发现个别字回退成了系统字体，就重新跑一次本脚本。

用法：
    pip install fonttools brotli
    # 下载 Noto Serif SC 可变字体（OFL 许可）：
    #   https://github.com/google/fonts/raw/main/ofl/notoserifsc/NotoSerifSC%5Bwght%5D.ttf
    python3 tools/subset-font.py /path/to/NotoSerifSC[wght].ttf
"""
import glob
import os
import sys

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'packages')
OUT = os.path.join(ROOT, 'client', 'public', 'fonts')
# 早期回合制场景已不可达，不为它们的文案占用字体体积
SKIP = ('BattleScene', 'MapScene', 'RewardScene')


def collect_chars() -> str:
    chars = set()
    for pattern in ('client/src/**/*.ts', 'shared/src/**/*.ts', 'client/index.html'):
        for path in glob.glob(os.path.join(ROOT, pattern), recursive=True):
            if any(k in path for k in SKIP):
                continue
            with open(path, encoding='utf8') as f:
                chars |= set(f.read())
    chars = {c for c in chars if ord(c) >= 0x2000}
    chars |= {chr(i) for i in range(0x20, 0x7F)}
    chars |= set('，。、；：！？（）「」『』【】《》·—…→×％＋－～“”‘’')
    return ''.join(sorted(chars))


def main() -> None:
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    text = collect_chars()
    font = instancer.instantiateVariableFont(TTFont(sys.argv[1]), {'wght': 700})
    opts = subset.Options()
    opts.flavor = 'woff2'
    opts.layout_features = []
    opts.hinting = False
    opts.desubroutinize = True
    sub = subset.Subsetter(opts)
    sub.populate(text=text)
    sub.subset(font)
    os.makedirs(OUT, exist_ok=True)
    out = os.path.join(OUT, 'NotoSerifSC-700-subset.woff2')
    subset.save_font(font, out, opts)
    with open(os.path.join(OUT, 'subset-chars.txt'), 'w', encoding='utf8') as f:
        f.write(text)
    print(f'{len(text)} chars -> {out} ({os.path.getsize(out) // 1024} KB)')


if __name__ == '__main__':
    main()
