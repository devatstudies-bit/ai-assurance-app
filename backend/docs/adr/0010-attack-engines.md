# ADR 0010: Attack generation stays inside dedicated red teaming engines

- **Status:** Accepted
- **Date:** 2026-10-02

## Context

Users wanted to choose the attack model per scan. Red teaming needs attack content to be generated and scored under controlled conditions: dedicated projects, access logging, restricted storage for transcripts (§7.6).

## Decision

An *attack model* in the registry is a red teaming **engine** that generates and scores its own attacks: the Azure AI Red Teaming Agent (one entry per Foundry project, for example per region) or the local simulation. The service selects the engine per scan and records it, and it does not generate attack content itself. Judge models score quality evaluations; they are not used to score scans.

## Consequences

- Attack material stays inside services built and governed for red teaming.
- Choosing an engine per scan supports data residency and separate projects.
- Organizations that want a specific attacker model configure it in their red teaming engine (the Azure agent and the PyRIT toolkit it is built on), not in this service.

## Alternatives considered

- **Generate attacks with a selected LLM inside this service**: not adopted.
