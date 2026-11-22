// mapshaper（0.7.101）には型が無いので、使う関数だけ書く。scripts/build-prefectures.ts で使う
declare module "mapshaper" {
  const mapshaper: {
    /** コマンドライン（mapshaper -i … -o …）と同じ文字列を受け取って実行する */
    runCommands(commands: string): Promise<void>;
  };
  export default mapshaper;
}
