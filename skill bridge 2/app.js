/* ======================================================
   SKILLBRIDGE - APP.JS
   Handles: switching Login/Sign Up tabs, form validation,
   and redirecting the user to profile.html
   ====================================================== */

/* ------------------------------------------------------
   1. GET REFERENCES TO IMPORTANT ELEMENTS
   ------------------------------------------------------ */
const loginTabBtn = document.getElementById("loginTabBtn");
const signupTabBtn = document.getElementById("signupTabBtn");

const loginForm = document.getElementById("loginForm");
const signupForm = document.getElementById("signupForm");

const signupError = document.getElementById("signupError");

/* ------------------------------------------------------
   2. SWITCH BETWEEN LOGIN AND SIGN UP TABS
   This function is called when the user clicks a tab
   button, or the "Sign Up" / "Login" links at the bottom
   of each form.
   ------------------------------------------------------ */
function switchTab(tabName) {
  if (tabName === "login") {
    // Show login form, hide signup form
    loginForm.classList.add("active");
    signupForm.classList.remove("active");

    // Update active styling on tab buttons
    loginTabBtn.classList.add("active");
    signupTabBtn.classList.remove("active");
  } else {
    // Show signup form, hide login form
    signupForm.classList.add("active");
    loginForm.classList.remove("active");

    // Update active styling on tab buttons
    signupTabBtn.classList.add("active");
    loginTabBtn.classList.remove("active");
  }
}

/* ------------------------------------------------------
   3. HANDLE LOGIN FORM SUBMIT
   Since this is a frontend-only MVP, we don't check the
   password against a database. We just validate that the
   fields are filled in, then redirect to profile.html
   ------------------------------------------------------ */
loginForm.addEventListener("submit", function (event) {
  // Stop the form from refreshing the page
  event.preventDefault();

  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value.trim();

  // Basic validation - HTML "required" already helps,
  // but we double check here too
  if (email === "" || password === "") {
    alert("Please fill in both email and password.");
    return;
  }

  // No real authentication - just move to the profile page
  window.location.href = "profile.html";
});

/* ------------------------------------------------------
   4. HANDLE SIGN UP FORM SUBMIT
   Validates the required fields and checks that the two
   password fields match, then redirects to profile.html
   ------------------------------------------------------ */
signupForm.addEventListener("submit", function (event) {
  event.preventDefault();

  const fullName = document.getElementById("signupName").value.trim();
  const email = document.getElementById("signupEmail").value.trim();
  const password = document.getElementById("signupPassword").value.trim();
  const confirmPassword = document.getElementById("signupConfirmPassword").value.trim();

  // Clear any previous error message
  signupError.textContent = "";

  // Check that nothing is empty
  if (fullName === "" || email === "" || password === "" || confirmPassword === "") {
    signupError.textContent = "Please fill in all fields.";
    return;
  }

  // Check that passwords match
  if (password !== confirmPassword) {
    signupError.textContent = "Passwords do not match.";
    return;
  }

  // Everything looks good - go to profile page
  window.location.href = "profile.html";
});
