# Maven Wrapper canonical files (vendored)

`/generate-code` skill が Spring Boot 系出力時にこのディレクトリ配下を verbatim コピーする。
採用プロジェクト B チームが `./mvnw spring-boot:run` で system Maven 不要で動かせるようにするのが目的。

## 配置

```
maven-wrapper/
├── mvnw                              # POSIX shell script (executable)
├── mvnw.cmd                          # Windows batch
└── .mvn/wrapper/maven-wrapper.properties  # wrapper version + distribution URL
```

## 出自 / ライセンス

[Apache Maven Wrapper](https://github.com/apache/maven-wrapper) version **3.3.2** (Apache License 2.0)。
`mvnw` / `mvnw.cmd` はファイル冒頭の Apache License 2.0 ヘッダを保持して再配布している。

更新時は次から再取得:

```bash
curl -fsSL -o mvnw \
  https://raw.githubusercontent.com/apache/maven-wrapper/maven-wrapper-3.3.2/maven-wrapper-distribution/src/resources/mvnw
curl -fsSL -o mvnw.cmd \
  https://raw.githubusercontent.com/apache/maven-wrapper/maven-wrapper-3.3.2/maven-wrapper-distribution/src/resources/mvnw.cmd
chmod +x mvnw
```

## maven-wrapper.properties の中身

`distributionType=only-script` モード (Maven Wrapper 3.x の標準) — 別途 `maven-wrapper.jar` を持たず、`distributionUrl` から直接 Maven 配布物を取得する。`mvnw` 初回実行時に `~/.m2/wrapper/dists/` 配下にダウンロードされる。

`distributionUrl` で固定している Maven 版は **3.9.9** (Spring Boot 3.5.x 標準同等)。新しい Maven へ追従する場合は本ファイルの URL のみ書き換えれば良い。
