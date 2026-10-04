# ADR 0006: Our own judge rubrics over a provider-neutral client

- **Status:** Accepted
- **Date:** 2026-10-02

## Context

Judges must be selectable across Azure OpenAI, OpenAI-compatible endpoints and Anthropic. The Azure AI Evaluation SDK's built-in evaluators accept Azure OpenAI and OpenAI model configurations, so they do not cover every judge the registry allows, and their prompts differ by evaluator.

## Decision

Implement the judge in `app/llm/`: a small client per provider style (`complete_json`, `chat`, `ping`) and one set of rubrics (`judge.py`) used by every judge model. Likert rubrics return a 1-5 score; binary rubrics return pass or fail; both include a short reason, stored per case. Anthropic calls use the official SDK with structured output; OpenAI-style providers use JSON mode.

## Consequences

- Any registered judge scores the same rubric, so scores are comparable and calibration (agreement with human labels) is meaningful per judge.
- Reasons are stored per case, so reviewers can see why a score was given.
- The rubrics are ours to maintain and calibrate; they are not Microsoft's evaluator prompts, so scores are not directly comparable with results produced elsewhere by the SDK evaluators.

## Alternatives considered

- **Use the SDK evaluators** (`GroundednessEvaluator` and others): standard prompts, but limited providers. They can be added later as another judge implementation behind the same interface for Azure OpenAI judges.
