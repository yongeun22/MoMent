# MoMent 운영 정책

최종 갱신: 2026-07-08

이 문서는 공개 전시 운영 중 반복해서 확인해야 하는 방명록, 사진 설명, 지도 좌표 기준을 정리한다. 공개 UI를 무겁게 만들지 않고, 로컬 관리자 앱과 정적 export 흐름을 유지하는 것을 기본값으로 둔다.

## 방명록 삭제

- v1에서는 공개 UI와 일반 관리자 화면에 방명록 삭제 버튼을 노출하지 않는다.
- 삭제는 `DELETE /api/traces`와 삭제 비밀번호 해시로만 처리한다.
- 삭제 비밀번호 원문은 코드, 문서, 커밋, README, 이슈, 채팅 기록에 남기지 않는다.
- 운영 환경에는 `TRACE_DELETE_PASSWORD_HASH`를 설정한다. 로컬 확인에는 `MOMENT_TRACE_DELETE_PASSWORD_HASH`를 사용할 수 있다.
- 잘못된 id 또는 비밀번호는 `Not found.`로 응답하게 둔다.

운영 절차:

1. `GET /api/traces` 응답에서 삭제할 항목의 `id`를 확인한다.
2. 삭제 비밀번호 원문은 운영자가 직접 입력하되 저장하지 않는다.
3. `DELETE /api/traces`에 `{ "id": 123, "password": "<delete-password>" }` JSON을 보낸다.
4. 삭제 후 `GET /api/traces` 또는 공개 방명록에서 항목이 사라졌는지 확인한다.

## 사진 설명

- 사진 설명은 사진 메타데이터의 일부로 보고 관리자 페이지에서 계속 수정한다.
- 수정한 설명은 `py -3.13 manage.py export-static` 실행 후 `dist/data/photos.json`에 반영된다.
- 설명은 짧고 중립적으로 유지한다.
- 실제 촬영 맥락을 모르면 역사 해석, 세부 촬영 지점, 감상평을 추정해서 쓰지 않는다.

기본 문장 형식:

```text
MoMent가 [장소]에서 기록한 [답사/박물관/문화유산/자연 경관] 사진입니다.
```

## 지도 좌표

- 좌표는 정확한 촬영 지점이 아니라 지도 탐색용 대표 좌표다.
- 명확한 장소명은 지도 검색에서 해당 장소명으로 잡히는 대표 지점을 사용한다.
- 사찰, 박물관, 궁궐, 고분군, 유적명처럼 장소가 확실한 항목은 해당 장소 대표 좌표를 사용한다.
- `ㅇㅇ시`, `ㅇㅇ군`, `ㅇㅇ도`처럼 정확한 촬영 장소를 모르는 항목은 시청, 군청, 도청 좌표를 사용한다.
- 해외 도시 단위 항목도 같은 원칙으로 시청 좌표를 사용한다.
- 실제 촬영 장소가 나중에 확인되면 `locationName`, `placeId`, `lat`, `lng`, `description`을 함께 갱신해 별도 장소 핀으로 분리한다.

현재 넓은 장소명 기준:

| 표시 장소명 | 좌표 기준 |
| --- | --- |
| `포항시` | 포항시청 |
| `서울특별시` | 서울특별시청 |
| `안성시` | 안성시청 |
| `제주특별자치도` | 제주특별자치도청 |
| `일본 교토시` | 교토시청 |
| `일본 나라시` | 나라시청 |

## 공개 반영

사진 설명이나 좌표를 수정한 뒤 공개 사이트에 반영할 때는 다음 순서를 따른다.

```powershell
py -3.13 manage.py export-static
py -3.13 -m unittest discover -s tests
git diff
git add README.md docs/operating-policy.md dist/data/photos.json
git commit -m "Update operating policy and photo coordinates"
git push origin main
```
