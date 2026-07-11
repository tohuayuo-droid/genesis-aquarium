# モック準拠UI

GitHub上の以下3ファイルを置き換え・追加してください。

- `index.html` を置き換え
- `style.css` を置き換え
- `ui-enhancements.js` を追加

`main.js` は変更不要です。

## 特徴

- 1920×1080配信向け
- 世界マップは960×560の比率を維持
- ドラマを中央の主役として大型表示
- ドラマ左側に参加キャラを使った簡易イラスト枠
- 右側に世界年代記
- 下部に世界・文明・注目キャラ
- 操作ボタンは非表示
- Seedから観測世界IDを自動表示

## 注意

`index.html` の末尾では、必ず次の順に読み込んでください。

```html
<script src="main.js"></script>
<script src="ui-enhancements.js"></script>
```
