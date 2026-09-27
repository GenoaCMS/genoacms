---
title: Introduction
---

GenoaCMS is a headless content management system written with portability and scalability in mind.

## Domain of use

It is designed to be used in small to medium sized projects, where tight integration with the rest of the system is a benefit. 

GenoaCMS is suitable choice for:

- Managing internal data of information systems
- Creating a blog or a website
- Manipulating data for a mobile application

## The name

A genoa is a large headsail. It is not a boat of its own: it is set on the mast a sailboat already
has, and it works alongside the mainsail that is already up.

GenoaCMS is meant to be added the same way:

- **The mast** is the cloud infrastructure you already run on.
- **The mainsail** is the project already running on that infrastructure, with its own database and storage.
- **The genoa** is GenoaCMS, added later on the existing mast.

GenoaCMS doesn't bring its own infrastructure. Adapters connect it to the storage and databases your
project already uses. Collections describe the data that is already there, so it can be edited in
place. That is why `genoa init` creates `genoa.config/collections.ts`: telling GenoaCMS about your
existing data is the first thing you do with it.
