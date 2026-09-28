1. What was the breakthrough that moved the work forward?

   The breakthrough was testing the deployed website myself, the way a real student would use it, instead of trusting that the tests had passed. Before building, I wrote a detailed plan with reference images and asked Claude to check it first. This already helped, because it found that two of my demo scenarios needed the same room at the same time.

   After deployment, all 57 automated tests were green. But when I switched to the second student and clicked "Accept segment", the site said "Invitation declined". Claude found that the tests sent requests directly and never ran the page script that caused the bug. After that, I kept using the live site like a real user and found more things that felt wrong: "Search rooms" opened the wrong page, switching users did not return to the home page, and choosing a teammate from a list was not realistic. Each problem became a clear request, such as searching by student number and confirming the name before sending the invitation.

2. What did this work change about who I want to be as a software developer?

   I want to be a developer who starts from the real situation the software is replacing. This week I rebuilt part of an ANU system that I actually use, so I could compare each screen with the real booking page and my own experience. This made the prototype feel much more realistic than just meeting the spec.

   I also learned that passing checks only proves what the checks actually test. As the person directing the agent, I need to know what is covered and what is not, and still use the product myself before I call it finished.
