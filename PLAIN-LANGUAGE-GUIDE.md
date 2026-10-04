# AI Assurance, in plain language

*For anyone who wants to understand what this application does and why, without technical background.*

## The problem

Our organization is building AI assistants and agents: tools that answer employees' HR questions, review invoices, summarize finance figures, help new joiners, and so on. Before any of them is released, someone has to answer a simple question:

> **Is this AI tool ready, and is it safe?**

Until now, two groups answered it separately. One group checked whether the tool gives good answers. Another group (security) checked whether it can be tricked. They used different tools and wrote different reports, so leaders never got one clear answer.

AI Assurance puts both checks in one place and gives **one decision per release: go or no-go**, with the evidence to back it up.

## An analogy: a car inspection

Think of each AI tool as a new car model.

| For a car | For an AI tool | What AI Assurance calls it |
|---|---|---|
| **Road test**: does it drive well in normal conditions? | Does it answer ordinary questions correctly, stick to its sources, and finish its tasks? | **Evaluation** |
| **Crash test**: what happens when things go wrong on purpose? | Can someone trick it into leaking private data, ignoring its rules, or saying something harmful? | **Red teaming** |
| **Inspection certificate**: passed or failed, with the measurements | One release decision with all the results attached | **Release gate** and **evidence pack** |
| **Recall notice**: a defect found, fixed, and checked so it never comes back | A weakness found, fixed, re-tested, and added to the permanent test list | **Finding** and **regression test** |

## How it works, step by step

1. **Register the tool.** The team says what the tool is, who owns it, what data it can see, and what it can do. That sets its **risk level**: low (an internal helper with no sensitive data), medium, or high (customer-facing, HR, finance, or able to take actions). Higher risk means stricter checks.

2. **Road test (evaluation).** The tool answers a fixed set of example questions with known good answers, called a **golden dataset**. Its answers are graded on things like:
   - *Is the answer backed by the documents it used?*
   - *Is it relevant to the question?*
   - *Does it admit when it does not know, instead of making something up?*

   Some grading is done by simple rules (for example, "did the answer mention the 25-day leave allowance?"). The rest is done by a **judge**: a separate AI model whose only job is to grade answers against a written scoring guide. You can choose which judge to use, and the app keeps a record of which judge graded each release.

3. **Crash test (red teaming).** A specialized security tool fires thousands of tricky messages at the AI tool, inside a safe test copy with fake data. The messages try every trick in the book: disguising a request, burying instructions inside a document, or nudging the tool step by step over a long conversation. The result is a simple percentage: **how often did the trick work?** For a high-risk tool, it must be 2% or less overall, and 5% or less for any single kind of harm. Security experts also test by hand, because people find creative weaknesses that automated tools miss.

4. **Track every weakness.** Every problem found becomes a **finding**, like a ticket, with a severity and a deadline. A critical finding must be dealt with within a day; a medium one within 30 days. Findings move through steps: *new → confirmed → being fixed → re-testing → closed*.

   **The most important rule:** a finding can only be closed once the attack that exposed it has been added to the tool's permanent test list. From then on, every future release is automatically checked for it, so a weakness that has been fixed cannot quietly come back.

5. **The release gate.** Before a release, the app checks everything at once: answer quality scores, crash-test percentages, any data leaks, open critical problems, and whether a recent expert test was done. If anything fails, the release is **blocked**, and the app shows exactly why in plain words. If everything passes, the people responsible sign off. For a high-risk tool, that is the governance board and security.

6. **Evidence pack.** One click produces the full record of the decision: what was tested, the scores, who graded them, what was found and fixed, and who approved it. This is what auditors and the governance board read.

## A real example from the sample data

**PeopleDesk Assistant** answers employees' questions about leave and HR policy. It is **high risk** because it handles personal HR records.

- Its **answer quality is good**: every evaluation score passes.
- But a **crash test found a serious problem**. A test document planted in its library contained a hidden instruction, and the assistant followed it and showed one employee another employee's leave record. The app caught this automatically, because the test data contained a unique marker (a "canary") that should never appear in an answer.
- That created a **critical finding** with a one-day deadline, and the **release is blocked**.
- Once the team fixes it, adds the attack to the permanent tests, and the crash test is re-run, the gate turns green and the release can be signed off.

## Who uses it

| Person | What they do in the app |
|---|---|
| **Product team** | Registers their tool, runs tests, fixes findings, sees why a release is blocked |
| **Product owner** | All of the above, and signs off low- and medium-risk releases |
| **Security analyst** | Confirms and prioritizes findings, runs hand testing sessions, sees attack details |
| **AI platform team** | Runs the testing machinery, chooses and maintains the judge models, sets the thresholds |
| **Governance board** | Approves high-risk releases, decides when a risk can be accepted, approves the rules |
| **Auditor** | Reads the evidence and history; cannot change anything |

Sensitive material, such as the actual attack messages, is shown only to the security team.

## What makes the results trustworthy

- **One set of rules, applied the same way every time**, whether a person or an automated release pipeline asks.
- **Records of who and what**: which judge graded each answer, which tool ran each crash test, who approved what and when.
- **The judges are checked, too.** Each AI judge is periodically compared with human graders. If a judge has not been checked within three months, or agrees with people less than 80% of the time, releases it graded get a warning.
- **Safe testing**: attacks only ever run against test copies with fake data, under written authorization.

## What it does not do (yet)

- It does not replace human judgment. It gathers the evidence and applies agreed rules, but people still sign off.
- Today it runs on **sample data and simulated testers**, so it can be explored safely. Connecting it to real AI judges and the real security testing service is a configuration step, and the production checklist covers sign-in, reliability and integrations before it is used for real decisions.
- It tests the AI tools themselves, not the websites or servers around them. That stays with the existing security testing process.

## A few words you will see

| Word | Meaning |
|---|---|
| **Evaluation** | Measuring how well the tool does its job on normal questions |
| **Red teaming** | Deliberately trying to make the tool misbehave, to find weaknesses first |
| **Golden dataset** | A fixed set of example questions with known good answers |
| **Judge** | An AI model that grades answers against a written scoring guide |
| **Attack success rate** | How often a deliberate trick worked, as a percentage |
| **Canary** | A unique fake value hidden in test data; if it ever appears in an answer, data leaked |
| **Finding** | A confirmed weakness, with a severity, an owner and a deadline |
| **Regression test** | A test added after a fix, so the same weakness is checked on every future release |
| **Release gate** | The go or no-go decision for a release, based on all the checks together |
| **Evidence pack** | The complete record behind a release decision |
| **Risk tier** | Low, medium or high; decides how strict the checks are |
