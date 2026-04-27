import os
import time
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException

# --- Progress Tracking Functions ---
def get_start_act(progress_file):
    if os.path.exists(progress_file):
        with open(progress_file, 'r') as f:
            try:
                last_act = int(f.read().strip())
                print(f"Resuming from Act No: {last_act + 1} (Last completed: {last_act})")
                return last_act + 1
            except ValueError:
                return 1
    return 1

def save_progress(progress_file, act_no):
    with open(progress_file, 'w') as f:
        f.write(str(act_no))

def setup_driver(base_download_folder):
    if not os.path.exists(base_download_folder):
        os.makedirs(base_download_folder)

    options = webdriver.ChromeOptions()
    prefs = {
        "download.default_directory": base_download_folder,
        "download.prompt_for_download": False,
        "download.directory_upgrade": True,
        "plugins.always_open_pdf_externally": True 
    }
    options.add_experimental_option("prefs", prefs)
    options.add_argument("--start-maximized")
    options.add_argument("user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0 Safari/537.36")
    
    driver = webdriver.Chrome(options=options)
    return driver

def main():
    max_act_no = 105
    base_download_folder = os.path.abspath(os.path.join(os.getcwd(), "indiacode_pdfs"))
    progress_file = os.path.abspath(os.path.join(os.getcwd(), "scraper_progress.txt"))
    
    print(f"Base folder for downloads: {base_download_folder}")
    
    start_act_no = get_start_act(progress_file)
    
    if start_act_no > max_act_no:
        print("All acts up to max_act_no have already been downloaded! Exiting.")
        return

    driver = setup_driver(base_download_folder)
    wait = WebDriverWait(driver, 15) 
    
    start_url = "https://www.indiacode.nic.in/handle/123456789/1362/browse?type=actno&order=ASC&rpp=100"
    
    try:
        for current_act_no in range(start_act_no, max_act_no + 1):
            act_str_01 = f"{current_act_no:02d}" 
            act_str_1 = str(current_act_no)      
            
            # --- FIX: Changed folder naming to just "1", "2", "3", etc. ---
            act_folder = os.path.join(base_download_folder, str(current_act_no))
            if not os.path.exists(act_folder):
                os.makedirs(act_folder)
            
            # Tell Chrome to change its download directory on the fly
            driver.execute_cdp_cmd('Page.setDownloadBehavior', {
                'behavior': 'allow',
                'downloadPath': act_folder
            })
            
            print(f"\n==========================================")
            print(f"Navigating to Browse Page to find Act No: {current_act_no}")
            print(f"Files will be saved in folder: {act_folder}")
            
            driver.get(start_url)
            
            try:
                act_link_xpath = f"//a[text()='{act_str_01}' or text()='{act_str_1}']"
                target_link = wait.until(EC.element_to_be_clickable((By.XPATH, act_link_xpath)))
                driver.execute_script("arguments[0].click();", target_link)
            except TimeoutException:
                print(f"Could not find link for Act No {current_act_no}. Skipping.")
                save_progress(progress_file, current_act_no)
                continue
            
            try:
                view_xpath = "//a[contains(translate(text(), 'VIEW', 'view'), 'view') or contains(@href, 'view_type=browse')]"
                wait.until(EC.presence_of_element_located((By.XPATH, view_xpath)))
                item_elements = driver.find_elements(By.XPATH, view_xpath)
            except TimeoutException:
                print(f"No 'View' documents found under Act No {current_act_no}.")
                save_progress(progress_file, current_act_no)
                continue
                
            item_urls = []
            for el in item_elements:
                href = el.get_attribute("href")
                if href and "/handle/" in href and href not in item_urls:
                    item_urls.append(href)
            
            print(f"Found {len(item_urls)} 'View' link(s) under Act No {current_act_no}")
            
            for act_url in item_urls:
                driver.get(act_url)
                print(f"  -> Extracting from: {act_url}")
                
                try:
                    pdf_xpath = "//a[contains(@href, '.pdf') or contains(translate(text(), 'DOWNLOAD', 'download'), 'download') or contains(@href, '/bitstream/')]"
                    pdf_link = wait.until(EC.element_to_be_clickable((By.XPATH, pdf_xpath)))
                    
                    print(f"     Found PDF link. Downloading to folder '{current_act_no}'...")
                    driver.execute_script("arguments[0].scrollIntoView(true);", pdf_link)
                    time.sleep(1) 
                    driver.execute_script("arguments[0].click();", pdf_link)
                    
                    time.sleep(8) 
                    
                except TimeoutException:
                    print("     Could not locate a PDF download link on this View page.")
                except Exception as e:
                    print(f"     Error clicking PDF for {act_url}: {e}")

            save_progress(progress_file, current_act_no)
            print(f"Successfully finished and saved progress for Act No: {current_act_no}")
                    
    except Exception as e:
        print(f"An overall error occurred: {e}")
    finally:
        print("\nScraper finished or stopped. Closing browser in 5 seconds...")
        time.sleep(5)
        driver.quit()
        print(f"Check the '{base_download_folder}' directory for your organized folders.")

if __name__ == "__main__":
    main()