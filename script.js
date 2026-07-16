const Category = Object.freeze({
    WARE: "ware",
    SCULPTURE: "sculpture",
    PAINTING: "painting",
}) 



const images = [
    { title: "Untitled 07", category: Category.WARE,      filename: "Untitled_05.webp" },
    { title: "Untitled 08", category: Category.PAINTING,  filename: "Untitled_02.webp" },
    { title: "Untitled 09", category: Category.SCULPTURE, filename: "Untitled_17.webp" },
    { title: "Untitled 04", category: Category.SCULPTURE, filename: "Untitled_13.webp" },
    { title: "Untitled 05", category: Category.SCULPTURE, filename: "Untitled_15.webp" },
    { title: "Untitled 06", category: Category.WARE,      filename: "Untitled_03.webp" },
    { title: "Untitled 15", category: Category.SCULPTURE, filename: "Untitled_19.webp" },
    { title: "Untitled 02", category: Category.PAINTING,  filename: "Untitled_12.webp" },
    { title: "Untitled 03", category: Category.WARE,      filename: "Untitled_09.webp" },
    { title: "Untitled 10", category: Category.WARE,      filename: "Untitled_06.webp" },
    { title: "Untitled 11", category: Category.SCULPTURE, filename: "Untitled_10.webp" },
    { title: "Untitled 12", category: Category.WARE,      filename: "Untitled_08.webp" },
    { title: "Untitled 13", category: Category.PAINTING,  filename: "Untitled_01.webp" },
    { title: "Untitled 14", category: Category.WARE,      filename: "Untitled_03.webp" },
    { title: "Untitled 01", category: Category.SCULPTURE, filename: "Untitled_20.webp" },
    { title: "Untitled 16", category: Category.WARE,      filename: "Untitled_04.webp" },
    { title: "Untitled 17", category: Category.SCULPTURE, filename: "Untitled_16.webp" },
    { title: "Untitled 18", category: Category.WARE,      filename: "Untitled_07.webp" },
    { title: "Untitled 19", category: Category.SCULPTURE, filename: "Untitled_14.webp" },
    { title: "Untitled 20", category: Category.PAINTING,  filename: "Untitled_11.webp" },
    { title: "Untitled 21", category: Category.SCULPTURE, filename: "Untitled_18.webp" },
]

// SETUP PAGES
const navBtns = document.querySelectorAll('.nav-btn')

navBtns.forEach((btn, i) => {
    const target = btn.getAttribute('data-target')

    btn.addEventListener('click', (e) => {

        // change the active navbtn
        document.querySelector('.nav-btn.active').classList.remove('active');
        e.target.classList.add('active');
        
        const target = e.target.getAttribute('data-target');

        const pageSections = document.querySelectorAll('section');
        pageSections.forEach((s) => {
            s.classList.add("hide");
        })
        
        document.getElementsByClassName(target)[0].classList.remove("hide")
    })
})

// POPULATE IMAGE GALLERY
const gallery = document.querySelector(".images-container");

images.forEach((img, i) => {
    const el = document.createElement("img");
    el.src = `assets/display/${img.filename}`;
    el.alt = `${img.category} titled ${img.title}`;
    el.dataset.category = img.category;
    el.classList.add('gallery-item');

    // lazy loading all but the first 3 images
    if (i > 3) el.loading = 'lazy';
    gallery.appendChild(el);
})

// SETUP IMAGE FILTERS
const filters = document.querySelectorAll('.filter');
const items = document.querySelectorAll('.gallery-item');

filters.forEach(filter => {
    filter.addEventListener('click', () => {

        // Update Class List: move 'active' to new filter btn 
        document.querySelector('.filter.active').classList.remove('active');
        filter.classList.add('active');

        // Update Gallery Images
        const category = filter.getAttribute('data-filter');

        items.forEach(item => {
            if (category === "all" || category === item.getAttribute('data-category')){
                item.classList.remove('hide');
            } else {
                item.classList.add('hide');
            }
        })
    })
})

