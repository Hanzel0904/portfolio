const toggle = document.querySelector(".nav-toggle");
const nav = document.querySelector("#site-nav");

toggle.addEventListener("click", () => {
  const open = nav.classList.toggle("open");
  toggle.setAttribute("aria-expanded", open ? "true" : "false");
  toggle.textContent = open ? "Close" : "Menu";
});

nav.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", () => {
    nav.classList.remove("open");
    toggle.setAttribute("aria-expanded", "false");
    toggle.textContent = "Menu";
  });
});

const form = document.querySelector("#contact-form");
const status = form.querySelector(".form-status");

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(form);
  const name = String(data.get("name") || "").trim();
  const email = String(data.get("email") || "").trim();
  const message = String(data.get("message") || "").trim();

  if (!name || !email || !message || !email.includes("@")) {
    status.textContent = "Add your name, a valid email, and a message.";
    return;
  }

  const subject = encodeURIComponent(`Internship inquiry from ${name}`);
  const body = encodeURIComponent(`${message}\n\n— ${name}\n${email}`);
  window.location.href = `mailto:nanez.gwen04@gmail.com?subject=${subject}&body=${body}`;
  status.textContent = "Your email app should open with this message.";
  form.reset();
});
