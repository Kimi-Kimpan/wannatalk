# WannaTalk

어르신을 위한 하루 15분 영어회화 웹앱. 큰 글씨, 큰 버튼, 스와이프 없이 버튼으로만 넘깁니다.
안드로이드 크롬에서 **홈 화면에 추가**하면 앱처럼 쓸 수 있습니다.

## 하루 공부
1. **편지** (온 날만): 클라라의 메시지를 듣고 뜻을 보고, 낱말 카드로 답장을 만들면 AI가 다듬어 줍니다.
2. **문장 카드**: 오늘 주제의 문장을 듣고 따라 말하기
3. **낱말 10개**: 배우고 듣고 고르기 문제
4. **묻고 답하기**: 클라우디아가 묻고, 말로 대답하거나 골라서 대답
5. **3분 대화**: 클라우디아와 자유 대화, 막히면 `도와주세요`

주제 10개(내 소개, 가족, 나의 하루, 젊은 시절, 지금 하는 일, 앞으로, 타임머신, 좋아하는 것, 스웨덴과 클라라, 마음과 생각)를 하루에 하나씩 돌고,
10일(한 바퀴)마다 점수를 보고 단계(1~5)를 올립니다. 대답에서 알게 된 사실은 **이야기 노트**에 저장되어 다음 질문을 더 깊게 만듭니다.

## 구조
| 부분 | 쓰는 것 |
|---|---|
| 화면 | GitHub Pages (이 저장소 그대로, 빌드 없음) |
| 로그인·진도·편지 | Supabase (메일 속 링크로 로그인) |
| AI 선생님 | Supabase Edge Function `tutor` → Gemini API (기본 gemini-3.5-flash, 붐비면 다른 Flash 모델) |
| 듣기·말하기 | 크롬 내장 음성 기능 |

```
index.html, css/, js/        화면
js/config.js                 Supabase 주소와 공개 키
supabase/schema.sql          데이터베이스 (SQL Editor에 붙여넣기)
supabase/functions/tutor/    AI 선생님 서버 코드
```

## 처음 설정 순서
1. **데이터베이스**: Supabase > SQL Editor > New query 에 `supabase/schema.sql` 전체를 붙여넣고 Run.
2. **로그인 주소**: Authentication > URL Configuration 의 Site URL 을 `https://kimi-kimpan.github.io/wannatalk/` 로 둡니다. (메일 속 링크가 이 주소로 돌아옵니다)
3. **AI 서버**: Edge Functions > Deploy a new function > Via Editor, 이름 `tutor`,
   `supabase/functions/tutor/index.ts` 내용을 붙여넣고 Deploy.
4. **Gemini 키**: Edge Functions > Secrets 에 `GEMINI_API_KEY` 추가. (모델을 바꾸려면 `GEMINI_MODEL` 도 추가)
5. **추가 기능(자서전 자료·관리자)**: `supabase/migrations/002_memoir_admin.sql` 도 SQL Editor에서 실행. 관리자 화면 주소는 `admin.html`.
6. **연결**: Project Settings > API 의 Project URL 과 anon(publishable) 키를 `js/config.js` 에 넣습니다.

> Supabase 기본 메일은 시간당 보낼 수 있는 수가 적습니다. 로그인은 한 번 하면 유지되니 보통은 문제없습니다.

## 클라라(가족) 연결
클라라가 같은 주소로 들어와 이메일로 로그인 → *I'm here to write to a learner* → 아버님 앱의 **설정 > 가족 번호** 6자리를 넣으면 됩니다.
