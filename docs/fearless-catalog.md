# Fearless 살인마 카탈로그 편집

Ben은 Cursor에서 `data/characters.csv`를 열고 **Edit CSV**로 다음 열을 편집하면 됩니다.

- `korean_name`: 화면에 사용할 한국어 이름
- `aliases`: 검색용 별명. 여러 개는 `|`로 구분 (예: `전구|닥터`)
- `sort_order`: 목록 순서. 1 이상의 중복되지 않는 정수

`id`와 `english_name`은 자산 연결에 쓰이므로 바꾸지 않는 것을 권장합니다. 편집 후 `npm run generate:killers`를 실행하면 입력값과 초상화 자산을 검증하고 `lib/killer-catalog.generated.json`을 갱신합니다. CSV 값에 쉼표나 큰따옴표가 들어가면 Edit CSV가 만드는 따옴표 형식을 그대로 유지하세요.

## 픽 규칙 요약

- 플레이어당 최대 4개 픽
- 같은 플레이어는 동일 살인마를 중복 기록할 수 없음
- 다른 플레이어끼리의 동일 살인마 중복은 허용
- 밴된 살인마도 의도적으로 픽할 수 있음
- 하드/소프트/개인 필터는 표시만 바꾸며 규칙을 강제하지 않음
