/* ======================================================
   SKILLBRIDGE - PROFILE.JS
   Handles: example skill list, adding/removing skill tags,
   image preview, and saving the profile (console.log + popup)
   ====================================================== */

/* ------------------------------------------------------
   1. LIST OF EXAMPLE SKILLS
   Shown as quick-add buttons in both the "Teach" and
   "Learn" sections.
   ------------------------------------------------------ */
const exampleSkillsList = [
  "Physics",
  "Mathematics",
  "Programming",
  "Python",
  "Java",
  "JavaScript",
  "HTML",
  "CSS",
  "Graphic Design",
  "Photography",
  "Music",
  "Cooking",
  "English",
  "Marketing",
  "Video Editing",
];

/* ------------------------------------------------------
   2. STORAGE FOR SELECTED SKILLS
   We keep two separate arrays: one for skills the user can
   teach, and one for skills the user wants to learn.
   ------------------------------------------------------ */
let teachSkills = [];
let learnSkills = [];

/* A small set of colors so tags look colorful and varied */
const tagColors = [
  "var(--tag-color-1)",
  "var(--tag-color-2)",
  "var(--tag-color-3)",
  "var(--tag-color-4)",
  "var(--tag-color-5)",
  "var(--tag-color-6)",
];

/* ------------------------------------------------------
   3. GET REFERENCES TO IMPORTANT ELEMENTS
   ------------------------------------------------------ */
const teachExampleSkillsDiv = document.getElementById("teachExampleSkills");
const learnExampleSkillsDiv = document.getElementById("learnExampleSkills");

const teachTagsDiv = document.getElementById("teachTags");
const learnTagsDiv = document.getElementById("learnTags");

const teachCustomInput = document.getElementById("teachCustomInput");
const learnCustomInput = document.getElementById("learnCustomInput");

const profileForm = document.getElementById("profileForm");
const popupOverlay = document.getElementById("popupOverlay");

const profileImageInput = document.getElementById("profileImageInput");
const imagePreview = document.getElementById("imagePreview");

/* ------------------------------------------------------
   4. BUILD THE EXAMPLE SKILL BUTTONS
   This runs once when the page loads. It creates a button
   for every skill in exampleSkillsList, for BOTH the
   "Teach" and "Learn" sections.
   ------------------------------------------------------ */
function renderExampleSkills() {
  exampleSkillsList.forEach((skill) => {
    // Button for the "Skills You Can Teach" section
    const teachBtn = document.createElement("button");
    teachBtn.type = "button";
    teachBtn.className = "example-skill-btn";
    teachBtn.textContent = skill;
    teachBtn.addEventListener("click", () => toggleExampleSkill(skill, "teach", teachBtn));
    teachExampleSkillsDiv.appendChild(teachBtn);

    // Button for the "Skills You Want to Learn" section
    const learnBtn = document.createElement("button");
    learnBtn.type = "button";
    learnBtn.className = "example-skill-btn";
    learnBtn.textContent = skill;
    learnBtn.addEventListener("click", () => toggleExampleSkill(skill, "learn", learnBtn));
    learnExampleSkillsDiv.appendChild(learnBtn);
  });
}

/* ------------------------------------------------------
   5. TOGGLE AN EXAMPLE SKILL ON/OFF
   Clicking an example skill button either adds it as a
   tag, or removes it if it was already selected.
   ------------------------------------------------------ */
function toggleExampleSkill(skill, type, buttonEl) {
  const skillsArray = type === "teach" ? teachSkills : learnSkills;

  if (skillsArray.includes(skill)) {
    // Already selected -> remove it
    removeSkill(skill, type);
    buttonEl.classList.remove("selected");
  } else {
    // Not selected yet -> add it
    addSkill(skill, type);
    buttonEl.classList.add("selected");
  }
}

/* ------------------------------------------------------
   6. ADD A CUSTOM SKILL (typed by the user)
   Called when the "Add" button next to the custom input
   is clicked.
   ------------------------------------------------------ */
function addCustomSkill(type) {
  const inputEl = type === "teach" ? teachCustomInput : learnCustomInput;
  const skill = inputEl.value.trim();

  if (skill === "") {
    return; // Ignore empty input
  }

  addSkill(skill, type);
  inputEl.value = ""; // Clear the input after adding
}

/* ------------------------------------------------------
   7. ADD A SKILL TO THE ARRAY + RENDER ITS TAG
   Shared logic used by both example skills and custom
   skills.
   ------------------------------------------------------ */
function addSkill(skill, type) {
  const skillsArray = type === "teach" ? teachSkills : learnSkills;

  // Avoid duplicates (case-insensitive check)
  const alreadyAdded = skillsArray.some(
    (s) => s.toLowerCase() === skill.toLowerCase()
  );
  if (alreadyAdded) {
    return;
  }

  skillsArray.push(skill);
  renderTags(type);
}

/* ------------------------------------------------------
   8. REMOVE A SKILL FROM THE ARRAY + RE-RENDER
   ------------------------------------------------------ */
function removeSkill(skill, type) {
  if (type === "teach") {
    teachSkills = teachSkills.filter((s) => s !== skill);
  } else {
    learnSkills = learnSkills.filter((s) => s !== skill);
  }

  renderTags(type);

  // Also un-highlight the example button if it matches this skill
  const container = type === "teach" ? teachExampleSkillsDiv : learnExampleSkillsDiv;
  const buttons = container.querySelectorAll(".example-skill-btn");
  buttons.forEach((btn) => {
    if (btn.textContent === skill) {
      btn.classList.remove("selected");
    }
  });
}

/* ------------------------------------------------------
   9. RENDER THE TAGS FOR A GIVEN SECTION
   Clears the tag container and rebuilds it from the
   current skills array, so tags always match the data.
   ------------------------------------------------------ */
function renderTags(type) {
  const skillsArray = type === "teach" ? teachSkills : learnSkills;
  const containerDiv = type === "teach" ? teachTagsDiv : learnTagsDiv;

  containerDiv.innerHTML = ""; // Clear existing tags

  skillsArray.forEach((skill, index) => {
    const tag = document.createElement("span");
    tag.className = "skill-tag";
    // Cycle through our tag colors so tags look varied
    tag.style.backgroundColor = tagColors[index % tagColors.length];

    tag.innerHTML = `
      ${skill}
      <span class="remove-tag" title="Remove">&times;</span>
    `;

    // Clicking the "x" removes this specific tag
    const removeBtn = tag.querySelector(".remove-tag");
    removeBtn.addEventListener("click", () => removeSkill(skill, type));

    containerDiv.appendChild(tag);
  });
}

/* ------------------------------------------------------
   10. PROFILE IMAGE PREVIEW
   When the user selects a photo, read it and show it in
   the circular preview.
   ------------------------------------------------------ */
profileImageInput.addEventListener("change", function (event) {
  const file = event.target.files[0];

  if (!file) {
    return;
  }

  // FileReader lets us read the image file and turn it into
  // a data URL we can display in the <img> tag
  const reader = new FileReader();

  reader.onload = function (e) {
    imagePreview.src = e.target.result;
  };

  reader.readAsDataURL(file);
});

/* ------------------------------------------------------
   11. HANDLE SAVE PROFILE (form submit)
   Collects every field, logs it to the console, and shows
   the success popup. No backend is involved - this is a
   frontend-only MVP.
   ------------------------------------------------------ */
profileForm.addEventListener("submit", function (event) {
  event.preventDefault();

  // Basic required-field check for the Basic Information section
  const fullName = document.getElementById("fullName").value.trim();
  const age = document.getElementById("age").value.trim();
  const gender = document.getElementById("gender").value;
  const education = document.getElementById("education").value.trim();
  const occupation = document.getElementById("occupation").value.trim();
  const location = document.getElementById("location").value.trim();
  const bio = document.getElementById("bio").value.trim();
  const availability = document.getElementById("availability").value;

  if (!fullName || !age || !gender || !education || !occupation || !location) {
    alert("Please fill in all required fields in Basic Information.");
    return;
  }

  if (!availability) {
    alert("Please select your availability.");
    return;
  }

  if (teachSkills.length === 0) {
    alert("Please add at least one skill you can teach.");
    return;
  }

  if (learnSkills.length === 0) {
    alert("Please add at least one skill you want to learn.");
    return;
  }

  // Get the selected learning preference (radio buttons)
  const learningPreference = document.querySelector(
    'input[name="learningPreference"]:checked'
  ).value;

  // Build one object containing the whole profile
  const profileData = {
    fullName: fullName,
    age: age,
    gender: gender,
    education: education,
    occupation: occupation,
    location: location,
    bio: bio,
    skillsToTeach: teachSkills,
    skillsToLearn: learnSkills,
    learningPreference: learningPreference,
    availability: availability,
  };

  // Print everything to the console, as requested
  console.log("Profile Saved:", profileData);

  // Show the custom success popup
  showPopup();
});

/* ------------------------------------------------------
   12. SHOW / HIDE THE SUCCESS POPUP
   ------------------------------------------------------ */
function showPopup() {
  popupOverlay.classList.add("show");
}

function closePopup() {
  popupOverlay.classList.remove("show");
  window.location.href = "match.html";
}

/* ------------------------------------------------------
   13. INITIALIZE THE PAGE
   Build the example skill buttons as soon as the script
   loads.
   ------------------------------------------------------ */
renderExampleSkills();
