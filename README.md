# Genesis Aquarium UI v1.0

GitHub上の次の2ファイルを丸ごと差し替えてください。

- `index.html`
- `style.css`

`main.js` は変更不要です。

## レイアウト

- 世界マップを最優先で大きく表示
- 「NOW PLAYING」と「注目キャラクター」を横並び
- 「世界の状態」と「文明・共同体」を最下段へ横並び
- 最下段は薄く固定
- 世界年代記は右側で全高表示
- 操作ボタンは非表示
- Canvasは960×560の比率を維持

## キャッシュ対策

`index.html` は次のようにCSSを読み込みます。

```html
<link rel="stylesheet" href="style.css?v=ui-v1" />
```
