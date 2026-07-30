---
id: about-project
stable_slug: project
title: About the Laptop-to-Cluster Guide
summary: "Purpose, scope, audience, and authority boundaries for this public fellowship resource."
artifact_type: report
route_namespace: about
topics: [project]
keywords: [BSSw, fellowship, HPC, scope]
audiences: [general public, fellowship reviewers, scientific software practitioners]
milestone: 1
status: published
publication_date: "2026-07-31"
---
## What this guide does
It helps scientific software practitioners translate multi-service laptop workflows into scheduler-managed, rootless-container workflows on shared HPC systems.

## Who it is for
The guide serves practitioners adapting an application, educators teaching the model, and fellowship reviewers examining the published work.

## Current scope
Milestone 1 covers a bounded, single-node Slurm and Apptainer baseline. It does not promise that one launch script works unchanged at every HPC center.

## What sets the requirements
The fellowship Statement of Work controls project deliverables and dates. Official BSSw program material provides program context. Prior-fellow examples inform project-adopted practices but do not create BSSw Fellowship Program obligations. Implementation choices are project decisions.

## What comes next
In progress for Milestone 2: a container-union pattern. A GPU container reuses a CPU container's prebuilt dependency tree inside one allocation, instead of rebuilding shared packages. Currently explored on a single Linux workstation; concurrent execution under a scheduler is not yet validated.

## Start using the guide
Read [Scheduler as Orchestrator](/guide/scheduler-as-orchestrator/), follow [Getting started](/start/), or inspect the public [companion repository](https://github.com/pnsinha/laptop-to-cluster).
